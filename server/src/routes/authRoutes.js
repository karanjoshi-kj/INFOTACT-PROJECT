const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const requireAuth = require("../middleware/auth");
const { isMailConfigured, sendMail } = require("../utils/mailer");

const router = express.Router();

// ---- password reset settings ----
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // link valid for 15 minutes
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000; // at most one email per minute per account
const MIN_PASSWORD_LENGTH = 8; // same as the signup form
const MAX_PASSWORD_LENGTH = 128; // bcrypt only uses the first 72 bytes anyway
const FORGOT_PASSWORD_MESSAGE =
  "If an account with that email exists, a password reset link will be sent shortly.";

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clientUrl = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");

async function sendResetEmail(user, token) {
  const resetLink = `${clientUrl()}/reset-password?token=${token}`;
  const name = user.name || "User";
  const minutes = RESET_TOKEN_TTL_MS / 60000;

  await sendMail({
    to: user.email,
    subject: "SyncDoc - Password Reset",
    text:
      `Hello ${name},\n\n` +
      `We received a request to reset your SyncDoc password.\n\n` +
      `Reset your password using this link:\n${resetLink}\n\n` +
      `This link will expire in ${minutes} minutes and can be used only once.\n\n` +
      `If you did not request a password reset, you can safely ignore this email.\n\n` +
      `- SyncDoc Team`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>SyncDoc Password Reset</h2>

        <p>Hello ${escapeHtml(name)},</p>

        <p>We received a request to reset your SyncDoc password.</p>

        <p>Click the button below to reset your password:</p>

        <p>
          <a
            href="${resetLink}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#2563eb;
              color:#ffffff;
              text-decoration:none;
              border-radius:6px;
            "
          >
            Reset Password
          </a>
        </p>

        <p>
          This link will expire in <strong>${minutes} minutes</strong> and can be used only once.
        </p>

        <p>If you did not request this password reset, you can safely ignore this email.</p>

        <p>- SyncDoc Team</p>
      </div>
    `,
  });
}

// ==============================
// SIGNUP
// ==============================
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      message: "User created",
      userId: newUser._id,
    });
  } catch (err) {
    console.error("Signup error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ==============================
// LOGIN
// ==============================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Google / GitHub accounts do not have a password.
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account uses Google or GitHub sign-in. Please use that option instead.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ==============================
// FORGOT PASSWORD
// ==============================
router.post("/forgot-password", async (req, res) => {
  try {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim() : "";

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please enter your email address.",
      });
    }

    // A server configuration problem, not account-specific, so it can be
    // reported without revealing whether the email is registered.
    if (!isMailConfigured()) {
      console.error(
        "Password reset unavailable: the email provider is not configured."
      );
      return res.status(503).json({
        success: false,
        message:
          "Password reset is temporarily unavailable. Please try again later.",
      });
    }

    const user = await User.findOne({ email }).select("+resetPasswordExpires");

    // Only accounts with a local password can be reset (not Google / GitHub).
    if (user && user.password) {
      const lastIssuedAt = user.resetPasswordExpires
        ? user.resetPasswordExpires.getTime() - RESET_TOKEN_TTL_MS
        : 0;
      const tooSoon = Date.now() - lastIssuedAt < RESET_REQUEST_COOLDOWN_MS;

      if (!tooSoon) {
        // 256 bits of randomness. Only the hash is stored.
        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashResetToken(token);

        // A new request replaces any earlier unused token.
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              resetPasswordTokenHash: tokenHash,
              resetPasswordExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
            },
          }
        );

        // Sent in the background so the response time is the same whether or
        // not the account exists. If sending fails, the unusable token is removed.
        sendResetEmail(user, token).catch(async (mailErr) => {
          console.error(
            "Password reset email could not be sent:",
            mailErr && (mailErr.code || mailErr.name)
          );
          try {
            await User.updateOne(
              { _id: user._id, resetPasswordTokenHash: tokenHash },
              { $unset: { resetPasswordTokenHash: 1, resetPasswordExpires: 1 } }
            );
          } catch {
            // nothing more to do; the token expires on its own
          }
        });
      }
    }

    // Same response for every case, so registered emails cannot be discovered.
    res.json({
      success: true,
      message: FORGOT_PASSWORD_MESSAGE,
    });
  } catch (err) {
    console.error("Forgot password error:", err && (err.code || err.name));

    res.status(500).json({
      success: false,
      message: "Unable to process the request. Please try again later.",
    });
  }
});

// ==============================
// RESET PASSWORD
// ==============================
router.post("/reset-password", async (req, res) => {
  try {
    const token =
      typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const confirmPassword =
      typeof req.body?.confirmPassword === "string"
        ? req.body.confirmPassword
        : "";

    const invalidLink = {
      success: false,
      message:
        "This reset link is invalid or has expired. Please request a new one.",
    };

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required.",
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters long.`,
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    // Tokens are 64 hex characters; reject anything else without a DB lookup.
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json(invalidLink);
    }

    const tokenHash = hashResetToken(token.toLowerCase());
    const filter = {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    };

    // Cheap check first so invalid tokens do not cost a bcrypt hash.
    const stillValid = await User.exists(filter);
    if (!stillValid) {
      return res.status(400).json(invalidLink);
    }

    // Same hashing method as signup.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Atomic: sets the password and removes the token in one operation, so a
    // token can never be used twice, even by two simultaneous requests.
    const updatedUser = await User.findOneAndUpdate(filter, {
      $set: { password: hashedPassword },
      $unset: { resetPasswordTokenHash: 1, resetPasswordExpires: 1 },
    });

    if (!updatedUser) {
      return res.status(400).json(invalidLink);
    }

    res.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (err) {
    console.error("Reset password error:", err && (err.code || err.name));

    res.status(500).json({
      success: false,
      message: "Unable to reset the password. Please try again later.",
    });
  }
});

// ==============================
// GET LOGGED-IN USER
// ==============================
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("name email");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found. Please log in again",
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Get user error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// ==============================
// GOOGLE + GITHUB OAUTH
// ==============================
router.use(require("./oauthRoutes"));

module.exports = router;