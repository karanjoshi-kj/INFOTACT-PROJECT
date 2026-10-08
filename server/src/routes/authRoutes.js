const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const requireAuth = require("../middleware/auth");

const router = express.Router();

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
    const { email } = req.body;

    const user = await User.findOne({ email });

    // Do not reveal whether the email exists.
    if (!user) {
      return res.json({
        success: true,
        message:
          "If an account exists, a password reset link has been sent.",
      });
    }

    // Google / GitHub accounts do not have local passwords.
    if (!user.password) {
      return res.json({
        success: true,
        message:
          "If an account exists, a password reset link has been sent.",
      });
    }

    // Create a temporary reset token valid for 15 minutes.
    const resetToken = jwt.sign(
      {
        userId: user._id,
        purpose: "password-reset",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "15m",
      }
    );

    const resetLink =
      `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

    // Gmail transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_APP_PASSWORD,
      },
    });

    // Send email
    await transporter.sendMail({
      from: `"SyncDoc" <${process.env.MAIL_USER}>`,
      to: user.email,
      subject: "SyncDoc - Password Reset",
      text:
        `Hello ${user.name || "User"},\n\n` +
        `We received a request to reset your SyncDoc password.\n\n` +
        `Reset your password using this link:\n${resetLink}\n\n` +
        `This link will expire in 15 minutes.\n\n` +
        `If you did not request a password reset, you can safely ignore this email.\n\n` +
        `- SyncDoc Team`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>SyncDoc Password Reset</h2>

          <p>Hello ${user.name || "User"},</p>

          <p>
            We received a request to reset your SyncDoc password.
          </p>

          <p>
            Click the button below to reset your password:
          </p>

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
            This link will expire in <strong>15 minutes</strong>.
          </p>

          <p>
            If you did not request this password reset, you can safely ignore this email.
          </p>

          <p>
            - SyncDoc Team
          </p>
        </div>
      `,
    });

    console.log(`Password reset email sent to: ${user.email}`);

    res.json({
      success: true,
      message:
        "If an account exists, a password reset link has been sent.",
    });
  } catch (err) {
    console.error("Forgot password email error:", err);

    res.status(500).json({
      success: false,
      message: "Unable to send password reset email.",
    });
  }
});

// ==============================
// RESET PASSWORD
// ==============================
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Reset token and new password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (tokenError) {
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or expired.",
      });
    }

    if (decoded.purpose !== "password-reset") {
      return res.status(400).json({
        success: false,
        message: "Invalid password reset token.",
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;

    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (err) {
    console.error("Reset password error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
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