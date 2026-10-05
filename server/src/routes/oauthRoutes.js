const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

const REQUEST_TIMEOUT_MS = 10000;
const STATE_TTL_MS = 10 * 60 * 1000;

class OAuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const clientUrl = () => (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
// The provider redirects back through the frontend origin; the Vite proxy forwards /api to this server.
const callbackUrl = (provider) => `${clientUrl()}/api/auth/${provider}/callback`;
const cookieName = (provider) => `syncdoc_oauth_${provider}`;

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth",
});

function parseCookies(header = "") {
  return header.split(";").reduce((acc, part) => {
    const index = part.indexOf("=");
    if (index < 0) return acc;
    acc[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    return acc;
  }, {});
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Not JSON — handled below.
  }

  if (!response.ok) {
    throw new Error(`${new URL(url).host} responded with status ${response.status}`);
  }
  return data;
}

// ---------- Provider-specific profile loading ----------

async function getGoogleProfile(code) {
  const token = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl("google"),
      grant_type: "authorization_code",
    }),
  });
  if (!token?.access_token) throw new Error("Google did not return an access token");

  const info = await fetchJson("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!info?.sub) throw new Error("Google did not return a user id");
  if (!info.email || !info.email_verified) throw new OAuthError("oauth_no_email");

  return {
    providerId: String(info.sub),
    email: info.email.trim().toLowerCase(),
    name: info.name,
  };
}

async function getGithubProfile(code) {
  const token = await fetchJson("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl("github"),
    }),
  });
  // GitHub answers 200 with { error } for a bad/expired code.
  if (!token?.access_token) throw new Error(token?.error_description || "GitHub did not return an access token");

  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "SyncDoc",
  };

  const profile = await fetchJson("https://api.github.com/user", { headers });
  if (!profile?.id) throw new Error("GitHub did not return a user id");

  const emails = await fetchJson("https://api.github.com/user/emails", { headers });
  const list = Array.isArray(emails) ? emails : [];
  const chosen = list.find((e) => e.primary && e.verified) || list.find((e) => e.verified);
  if (!chosen?.email) throw new OAuthError("oauth_no_email");

  return {
    providerId: String(profile.id),
    email: chosen.email.trim().toLowerCase(),
    name: profile.name || profile.login,
  };
}

const PROVIDERS = {
  google: {
    idField: "googleId",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    authParams: { response_type: "code", scope: "openid email profile", prompt: "select_account" },
    getProfile: getGoogleProfile,
  },
  github: {
    idField: "githubId",
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    authUrl: "https://github.com/login/oauth/authorize",
    authParams: { scope: "read:user user:email" },
    getProfile: getGithubProfile,
  },
};

// ---------- Users ----------

// 1) known provider id -> that user
// 2) same (provider-verified) email -> link provider to the existing account
// 3) otherwise create a new account
async function findOrCreateUser(idField, { providerId, email, name }) {
  const byEmail = () => User.findOne({ email }).collation({ locale: "en", strength: 2 });

  let user = await User.findOne({ [idField]: providerId });
  if (user) return user;

  user = await byEmail();
  if (user) {
    user[idField] = providerId;
    await user.save();
    return user;
  }

  try {
    return await User.create({
      name: name || email.split("@")[0],
      email,
      [idField]: providerId,
    });
  } catch (err) {
    // Two requests created the same user at once — use the one that won.
    if (err.code === 11000) {
      const existing = (await User.findOne({ [idField]: providerId })) || (await byEmail());
      if (existing) {
        if (!existing[idField]) {
          existing[idField] = providerId;
          await existing.save();
        }
        return existing;
      }
    }
    throw err;
  }
}

// ---------- Redirect helpers ----------

function redirectWithError(res, code) {
  res.redirect(`${clientUrl()}/login?error=${encodeURIComponent(code)}`);
}

function redirectWithToken(res, token, remember) {
  // The token travels in the URL fragment, so it is never sent to a server or logged.
  res.redirect(`${clientUrl()}/oauth/callback#token=${encodeURIComponent(token)}&remember=${remember ? "1" : "0"}`);
}

// ---------- Handlers ----------

const startHandler = (name) => (req, res) => {
  const provider = PROVIDERS[name];

  if (!provider.clientId() || !provider.clientSecret()) {
    return redirectWithError(res, "oauth_not_configured");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const remember = req.query.remember === "1";

  // Signed, httpOnly cookie that ties the callback to the browser that started the login.
  const stateToken = jwt.sign({ state, remember }, process.env.JWT_SECRET, { expiresIn: "10m" });
  res.cookie(cookieName(name), stateToken, { ...cookieOptions(), maxAge: STATE_TTL_MS });

  const params = new URLSearchParams({
    client_id: provider.clientId(),
    redirect_uri: callbackUrl(name),
    state,
    ...provider.authParams,
  });

  res.redirect(`${provider.authUrl}?${params.toString()}`);
};

const callbackHandler = (name) => async (req, res) => {
  const provider = PROVIDERS[name];
  const { code, state, error } = req.query;

  const stateToken = parseCookies(req.headers.cookie)[cookieName(name)];
  res.clearCookie(cookieName(name), cookieOptions());

  if (error) return redirectWithError(res, "oauth_denied");

  let saved;
  try {
    saved = jwt.verify(stateToken, process.env.JWT_SECRET);
  } catch {
    return redirectWithError(res, "oauth_state");
  }

  if (typeof state !== "string" || !safeEqual(state, saved.state)) {
    return redirectWithError(res, "oauth_state");
  }
  if (typeof code !== "string" || !code) {
    return redirectWithError(res, "oauth_failed");
  }

  try {
    const profile = await provider.getProfile(code);
    const user = await findOrCreateUser(provider.idField, profile);

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    redirectWithToken(res, token, saved.remember);
  } catch (err) {
    console.error(`${name} OAuth failed:`, err.message);
    redirectWithError(res, err instanceof OAuthError ? err.code : "oauth_failed");
  }
};

Object.keys(PROVIDERS).forEach((name) => {
  router.get(`/${name}`, startHandler(name));
  router.get(`/${name}/callback`, callbackHandler(name));
});

module.exports = router;