require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { google } = require("googleapis");

const app = express();

const PORT = process.env.PORT || 3001;
const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "25mb" }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "nebula-mail-ai-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    },
  })
);

// --------------------------------------------------
// Google OAuth configuration
// --------------------------------------------------

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Nebula Mail AI backend is running",
  });
});

// --------------------------------------------------
// Start Google OAuth
// --------------------------------------------------

app.get("/auth/google", (req, res) => {
  try {
    const oauth2Client = createOAuthClient();

    const authorizationUrl =
      oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: GOOGLE_SCOPES,
      });

    res.redirect(authorizationUrl);
  } catch (error) {
    console.error(
      "Google OAuth start error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Unable to start Google OAuth",
    });
  }
});

// --------------------------------------------------
// Google OAuth callback
// --------------------------------------------------

app.get(
  "/auth/google/callback",
  async (req, res) => {
    try {
      const { code } = req.query;

      if (!code) {
        return res
          .status(400)
          .send("Authorization code is missing.");
      }

      const oauth2Client =
        createOAuthClient();

      const { tokens } =
        await oauth2Client.getToken(code);

      oauth2Client.setCredentials(tokens);

      // Store Google tokens in the server session
      req.session.googleTokens = tokens;

      console.log("Google OAuth successful.");

      res.redirect(
        `${FRONTEND_URL}/?gmail=connected`
      );
    } catch (error) {
      console.error(
        "Google OAuth callback error:",
        error
      );

      res.status(500).send(`
        <h1>Google authentication failed</h1>
        <p>Please check the backend terminal for the error.</p>
      `);
    }
  }
);

// --------------------------------------------------
// Check authentication status
// --------------------------------------------------

app.get("/api/auth/status", (req, res) => {
  const connected =
    Boolean(req.session.googleTokens);

  res.json({
    connected,
  });
});

// --------------------------------------------------
// Get Gmail profile
// --------------------------------------------------

app.get(
  "/api/gmail/profile",
  async (req, res) => {
    try {
      if (!req.session.googleTokens) {
        return res.status(401).json({
          success: false,
          message: "Gmail is not connected.",
        });
      }

      const oauth2Client =
        createOAuthClient();

      oauth2Client.setCredentials(
        req.session.googleTokens
      );

      const gmail = google.gmail({
        version: "v1",
        auth: oauth2Client,
      });

      const response =
        await gmail.users.getProfile({
          userId: "me",
        });

      res.json({
        success: true,
        profile: response.data,
      });
    } catch (error) {
      console.error(
        "Gmail profile error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to retrieve Gmail profile.",
      });
    }
  }
);

// --------------------------------------------------
// Logout
// --------------------------------------------------

app.post(
  "/api/auth/logout",
  (req, res) => {
    req.session.destroy(() => {
      res.json({
        success: true,
        message: "Logged out successfully.",
      });
    });
  }
);

// ==================================================
// Gmail helper functions
// ==================================================

function getHeader(headers = [], name) {
  const header = headers.find(
    (item) =>
      String(item.name || "").toLowerCase() ===
      String(name || "").toLowerCase()
  );
  return header ? String(header.value || "") : "";
}

function decodeBase64Url(data = "") {
  if (!data) return "";

  const normalized = String(data)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(html = "") {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \\t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractEmailBody(payload) {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }

    for (const part of payload.parts) {
      const result = extractEmailBody(part);
      if (result) return result;
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return "";
}

function parseAddress(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/^(.*?)\s*<([^>]+)>$/);

  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, "").trim() || match[2].trim(),
      email: match[2].trim(),
    };
  }

  return {
    name: text,
    email: text,
  };
}

function formatEmail(data, folder, body = "") {
  const headers = data.payload?.headers || data.payload?.headers || [];
  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const subject = getHeader(headers, "Subject") || "(No subject)";
  const parsedFrom = parseAddress(from);
  const timestamp = Number(data.internalDate) || Date.now();

  return {
    id: data.id,
    threadId: data.threadId,
    folder,
    sender: parsedFrom.name,
    from: parsedFrom.name,
    email: parsedFrom.email,
    recipient: to,
    to,
    subject,
    body: body || data.snippet || "",
    snippet: data.snippet || "",
    date: new Date(timestamp).toISOString(),
    time: new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
    timestamp,
    unread: folder === "Inbox" && (data.labelIds || []).includes("UNREAD"),
    starred: (data.labelIds || []).includes("STARRED"),
    snoozedUntil: null,
    archived: false,
    trash: (data.labelIds || []).includes("TRASH"),
    attachments: [],
  };
}

function getGmailClient(req) {
  if (!req.session.googleTokens) return null;

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(req.session.googleTokens);

  return google.gmail({
    version: "v1",
    auth: oauth2Client,
  });
}

async function listGmailFolder(gmail, labelId, folder) {
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelId],
    maxResults: 30,
  });

  const messageList = listResponse.data.messages || [];

  // Metadata is enough for the list screen. The full body is fetched only
  // when the user opens a message, which makes the inbox much faster.
  const details = await Promise.all(
    messageList.map((message) =>
      gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      })
    )
  );

  return details
    .map((response) => formatEmail(response.data, folder))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function requireGmail(req, res) {
  if (!req.session.googleTokens) {
    res.status(401).json({
      success: false,
      message: "Gmail is not connected.",
    });
    return null;
  }

  return getGmailClient(req);
}

// ==================================================
// Gmail INBOX
// ==================================================

app.get("/api/gmail/inbox", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    const emails = await listGmailFolder(gmail, "INBOX", "Inbox");

    res.json({
      success: true,
      emails,
    });
  } catch (error) {
    console.error("Gmail inbox error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve Gmail inbox.",
      error: error.message,
    });
  }
});

// ==================================================
// Gmail SENT
// ==================================================

app.get("/api/gmail/sent", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    const emails = await listGmailFolder(gmail, "SENT", "Sent");

    res.json({
      success: true,
      emails,
    });
  } catch (error) {
    console.error("Gmail sent error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve Gmail sent emails.",
      error: error.message,
    });
  }
});

// ==================================================
// Gmail MESSAGE DETAIL
// ==================================================

app.get("/api/gmail/message/:id", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    const response = await gmail.users.messages.get({
      userId: "me",
      id: req.params.id,
      format: "full",
    });

    const data = response.data;
    const folder = (data.labelIds || []).includes("SENT") ? "Sent" : "Inbox";
    const email = formatEmail(data, folder, extractEmailBody(data.payload));

    res.json({
      success: true,
      email,
    });
  } catch (error) {
    console.error("Gmail message detail error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve this Gmail message.",
      error: error.message,
    });
  }
});

// ==================================================
// Mark Gmail message as read
// ==================================================

app.post("/api/gmail/message/:id/read", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    await gmail.users.messages.modify({
      userId: "me",
      id: req.params.id,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Gmail mark-read error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to mark this email as read.",
      error: error.message,
    });
  }
});

// ==================================================
// MIME / attachment helpers
// ==================================================

function safeHeader(value = "") {
  return String(value)
    .replace(/[\r\n]/g, "")
    .trim();
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizeAttachmentName(value = "attachment") {
  const name = safeHeader(value).replace(/[\/\\]/g, "_");
  return name || "attachment";
}

function buildMimeMessage({ to, subject, body, attachments = [] }) {
  const cleanTo = safeHeader(to);
  const cleanSubject = safeHeader(subject);
  const cleanBody = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [
      `To: ${cleanTo}`,
      `Subject: ${cleanSubject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      cleanBody,
    ].join("\r\n");
  }

  const boundary = `----=_NebulaMail_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const parts = [
    `To: ${cleanTo}`,
    `Subject: ${cleanSubject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    cleanBody,
  ];

  for (const attachment of attachments) {
    if (!attachment?.data) continue;

    const filename = normalizeAttachmentName(attachment.name);
    const mimeType = safeHeader(attachment.type || "application/octet-stream") || "application/octet-stream";

    // Client sends the file as base64. Re-wrap it at 76 chars for MIME.
    const base64 = String(attachment.data).replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    const wrapped = base64.match(/.{1,76}/g)?.join("\r\n") || "";

    parts.push(
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      wrapped
    );
  }

  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}

// ==================================================
// SEND REAL GMAIL MESSAGE
// ==================================================

app.post("/api/gmail/send", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    const to = safeHeader(req.body?.to);
    const subject = safeHeader(req.body?.subject);
    const body = String(req.body?.body || "").trim();
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
      : [];

    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: "To, subject and body are required.",
      });
    }

    const rawMessage = buildMimeMessage({
      to,
      subject,
      body,
      attachments,
    });

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: toBase64Url(rawMessage),
      },
    });

    const sentResponse = await gmail.users.messages.get({
      userId: "me",
      id: response.data.id,
      format: "full",
    });

    const email = formatEmail(
      sentResponse.data,
      "Sent",
      extractEmailBody(sentResponse.data.payload)
    );

    res.json({
      success: true,
      email,
    });
  } catch (error) {
    console.error("Gmail send error:", error);
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Unable to send the email through Gmail.",
    });
  }
});

// ==================================================
// GMAIL DRAFTS
// ==================================================

app.get("/api/gmail/drafts", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    const listResponse = await gmail.users.drafts.list({
      userId: "me",
      maxResults: 30,
    });

    const drafts = listResponse.data.drafts || [];

    const details = await Promise.all(
      drafts.map((draft) =>
        gmail.users.drafts.get({
          userId: "me",
          id: draft.id,
          format: "full",
        })
      )
    );

    const emails = details.map((response) => {
      const draft = response.data;
      const message = draft.message || {};
      const email = formatEmail(
        message,
        "Drafts",
        extractEmailBody(message.payload)
      );

      return {
        ...email,
        id: message.id || draft.id,
        draftId: draft.id,
        folder: "Drafts",
        unread: false,
        body: extractEmailBody(message.payload) || message.snippet || "",
      };
    });

    emails.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      success: true,
      emails,
    });
  } catch (error) {
    console.error("Gmail drafts error:", error);
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Unable to retrieve Gmail drafts.",
    });
  }
});

app.post("/api/gmail/drafts", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    const to = safeHeader(req.body?.to);
    const subject = safeHeader(req.body?.subject);
    const body = String(req.body?.body || "");
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
      : [];
    const draftId = safeHeader(req.body?.draftId);

    if (!to && !subject && !body.trim() && attachments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Draft is empty.",
      });
    }

    const rawMessage = buildMimeMessage({
      to,
      subject,
      body,
      attachments,
    });

    const requestBody = {
      message: {
        raw: toBase64Url(rawMessage),
      },
    };

    let response;

    if (draftId) {
      response = await gmail.users.drafts.update({
        userId: "me",
        id: draftId,
        requestBody,
      });
    } else {
      response = await gmail.users.drafts.create({
        userId: "me",
        requestBody,
      });
    }

    res.json({
      success: true,
      draftId: response.data.id,
      messageId: response.data.message?.id || null,
    });
  } catch (error) {
    console.error("Gmail draft save error:", error);
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Unable to save the draft.",
    });
  }
});

app.delete("/api/gmail/drafts/:id", async (req, res) => {
  try {
    const gmail = requireGmail(req, res);
    if (!gmail) return;

    await gmail.users.drafts.delete({
      userId: "me",
      id: req.params.id,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Gmail draft delete error:", error);
    res.status(500).json({
      success: false,
      message: error?.response?.data?.error?.message || error.message || "Unable to delete the draft.",
    });
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Nebula Mail AI backend running on http://127.0.0.1:${PORT}`
  );
});

server.on("error", (error) => {
  console.error("SERVER ERROR:", error);
});
