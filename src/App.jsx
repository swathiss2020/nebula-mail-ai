import {
  Archive,
  Bell,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Clock,
  File,
  Inbox,
  Mail,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  X,
  Zap,
  User
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import "./App.css";

/* =========================================================
   SAMPLE EMAIL DATA
   ========================================================= */

const initialEmails = [
  {
    id: 1,
    folder: "Inbox",
    sender: "Sarah Johnson",
    email: "sarah@company.com",
    recipient: "swathi@example.com",
    subject: "Project Update",
    body:
      "Hi Swathi,\n\nHere is the latest project update. The implementation is progressing well and we should be ready for the next review.\n\nThanks,\nSarah",
    date: "Sep 7, 2026",
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
    unread: true,
    starred: false,
    archived: false,
    trash: false,
    snoozedUntil: null
  },
  {
    id: 2,
    folder: "Inbox",
    sender: "David Kumar",
    email: "david@company.com",
    recipient: "swathi@example.com",
    subject: "Meeting Tomorrow",
    body:
      "Hi Swathi,\n\nJust a reminder that we have our meeting tomorrow at 3 PM.\n\nRegards,\nDavid",
    date: "Sep 6, 2026",
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
    unread: false,
    starred: true,
    archived: false,
    trash: false,
    snoozedUntil: null
  },
  {
    id: 3,
    folder: "Inbox",
    sender: "HR Team",
    email: "hr@company.com",
    recipient: "swathi@example.com",
    subject: "Important Announcement",
    body:
      "Please check the latest company announcement and complete the required action before the deadline.",
    date: "Sep 4, 2026",
    timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000,
    unread: true,
    starred: false,
    archived: false,
    trash: false,
    snoozedUntil: null
  },
  {
    id: 4,
    folder: "Sent",
    sender: "Swathi",
    email: "swathi@example.com",
    recipient: "team@company.com",
    subject: "Weekly Status",
    body:
      "Hi Team,\n\nPlease find my weekly status update attached.\n\nThanks,\nSwathi",
    date: "Sep 3, 2026",
    timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
    unread: false,
    starred: false,
    archived: false,
    trash: false,
    snoozedUntil: null
  }
];

const safeText = (value) => String(value ?? "");

/* =========================================================
   AI COMMAND PARSER
   ========================================================= */

function parseAICommand(command) {
  const text = command.trim();

  /* SEND EMAIL
     Greedy body capture preserves apostrophes like:
     Let's meet at 3pm
  */
  const sendMatch = text.match(
    /send\s+(?:an\s+)?email\s+to\s+([^\s]+)\s+with\s+subject\s+(['"])(.*?)\2\s+and\s+body\s+(['"])([\s\S]*)\4\s*\.?\s*$/i
  );

  if (sendMatch) {
    return {
      type: "send_email",
      to: sendMatch[1],
      subject: sendMatch[3].trim(),
      body: sendMatch[5].trim()
    };
  }

  /* COMPOSE */
  if (
    /^(compose|compose an email|write an email|new email)$/i.test(text) ||
    /\bopen compose\b/i.test(text)
  ) {
    return { type: "compose" };
  }

  /* NAVIGATION */

  if (/\b(inbox)\b/i.test(text) && !/\bfrom\b/i.test(text)) {
    return { type: "navigate", folder: "Inbox" };
  }

  if (/\bsent\b/i.test(text) && !/\bemail to\b/i.test(text)) {
    return { type: "navigate", folder: "Sent" };
  }

  if (/\ball mail\b/i.test(text)) {
    return { type: "navigate", folder: "All Mail" };
  }

  if (/\btrash\b/i.test(text)) {
    return { type: "navigate", folder: "Trash" };
  }

  if (/\bdrafts\b/i.test(text)) {
    return { type: "navigate", folder: "Drafts" };
  }

  if (/\bsnoozed\b/i.test(text)) {
    return { type: "navigate", folder: "Snoozed" };
  }

  if (/\bstarred\b/i.test(text)) {
    return { type: "navigate", folder: "Starred" };
  }

  /* LAST N DAYS */

  const lastDays = text.match(/\b(?:last|past)\s+(\d+)\s+days?\b/i);

  if (lastDays) {
    return {
      type: "filter",
      date: `last-${lastDays[1]}`
    };
  }

  /* LATEST EMAIL FROM SOMEONE */

  const latestSender = text.match(
    /\b(?:open|show|find)\s+(?:the\s+)?(?:latest|most\s+recent)\s+email\s+from\s+([a-z][a-z .'-]+)/i
  );

  if (latestSender) {
    return {
      type: "latest_from",
      sender: latestSender[1].trim()
    };
  }

  /* FROM + ABOUT */

  const senderAbout = text.match(
    /\bfrom\s+([a-z][a-z .'-]+?)(?=\s+(?:about|regarding|with|that|who|and|this)\b|$)/i
  );

  const aboutMatch = text.match(
    /\babout\s+(.+?)(?:\s+please|\s+thanks|$)/i
  );

  if (senderAbout && aboutMatch) {
    return {
      type: "filter",
      sender: senderAbout[1].trim(),
      keyword: aboutMatch[1].trim()
    };
  }

  /* UNREAD */

  if (/\bunread\b/i.test(text)) {
    return {
      type: "filter",
      read: "unread"
    };
  }

  /* READ */

  if (/\bonly read\b/i.test(text)) {
    return {
      type: "filter",
      read: "read"
    };
  }

  /* MARK READ / UNREAD */
  if (/\b(?:mark|make)\s+(?:this|the current|this email)\s+(?:as\s+)?read\b/i.test(text)) {
    return { type: "mark_read" };
  }

  if (/\b(?:mark|make)\s+(?:this|the current|this email)\s+(?:as\s+)?unread\b/i.test(text)) {
    return { type: "mark_unread" };
  }

  /* CLEAR SEARCH / FILTERS */
  if (/\b(?:clear|reset)\s+(?:the\s+)?(?:search|filters?)\b/i.test(text)) {
    return { type: "clear_filters" };
  }

  /* CURRENT EMAIL ACTIONS */

  if (/\breply\s+to\s+(this|the current|this email)\b/i.test(text)) {
    return { type: "reply" };
  }

  if (/\bforward\s+(this|the current|this email)\b/i.test(text)) {
    return { type: "forward" };
  }

  if (/\barchive\s+(this|the current|this email)\b/i.test(text)) {
    return { type: "archive_current" };
  }

  if (/\bdelete\s+(this|the current|this email)\b/i.test(text)) {
    return { type: "delete_current" };
  }

  if (/\bsnooze\s+(this|the current|this email)\b/i.test(text)) {
    return { type: "snooze_current" };
  }

  /* SEARCH */

  const searchMatch = text.match(
    /^(?:search|find)\s+(?:for\s+)?(.+)$/i
  );

  if (searchMatch) {
    return {
      type: "search",
      keyword: searchMatch[1].trim()
    };
  }

  /* OPEN EMAIL */

  const openMatch = text.match(
    /^(?:open|show)\s+(?:the\s+)?email\s+(?:with\s+)?(?:subject\s+)?["']?(.+?)["']?$/i
  );

  if (openMatch) {
    return {
      type: "open",
      keyword: openMatch[1].trim()
    };
  }

  return {
    type: "unknown"
  };
}

/* =========================================================
   SIDEBAR
   ========================================================= */

function Sidebar({
  activeFolder,
  setActiveFolder,
  onCompose,
  unreadCount
}) {
  const items = [
    { name: "Inbox", icon: Inbox },
    { name: "Starred", icon: Star },
    { name: "Snoozed", icon: Clock },
    { name: "Sent", icon: Send },
    { name: "Drafts", icon: File },
    { name: "All Mail", icon: Mail },
    { name: "Trash", icon: Trash2 }
  ];

  return (
    <aside className="sidebar">
      <button className="compose-button" onClick={onCompose}>
        <Plus size={17} />
        <span>Compose</span>
      </button>

      <div className="sidebar-section-title">Mail</div>

      {items.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.name}
            className={`nav-item ${
              activeFolder === item.name ? "active" : ""
            }`}
            onClick={() => setActiveFolder(item.name)}
          >
            <Icon size={16} />

            <span className="nav-label">{item.name}</span>

            {item.name === "Inbox" && unreadCount > 0 && (
              <span className="nav-count">{unreadCount}</span>
            )}
          </button>
        );
      })}

      <div className="sidebar-section-title">Manage</div>

      <button
        className={`nav-item ${
          activeFolder === "Settings" ? "active" : ""
        }`}
        onClick={() => setActiveFolder("Settings")}
      >
        <Settings size={16} />
        <span className="nav-label">Settings</span>
      </button>

      <button
        className={`nav-item ${
          activeFolder === "Profile" ? "active" : ""
        }`}
        onClick={() => setActiveFolder("Profile")}
      >
        <Users size={16} />
        <span className="nav-label">Profile</span>
      </button>
    </aside>
  );
}

/* =========================================================
   TOP BAR
   ========================================================= */

function TopBar({
  search,
  setSearch,
  darkMode,
  setDarkMode,
  profileName,
  onProfile
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-logo">N</div>

        <div>
          <div className="brand-name">Nebula Mail</div>
          <div className="brand-subtitle">AI-powered email</div>
        </div>
      </div>

      <div className="top-search">
        <Search size={16} />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emails..."
        />
      </div>

      <div className="top-actions">
        <button className="icon-button" title="Notifications">
          <Bell size={17} />
        </button>

        <button
          className="icon-button"
          title="Toggle dark mode"
          onClick={() => setDarkMode(!darkMode)}
        >
          <Zap size={17} />
        </button>

        <button
          className="profile-button"
          onClick={onProfile}
          title="Open profile"
        >
          <div className="profile-avatar">
            {profileName.charAt(0).toUpperCase()}
          </div>

          <span>{profileName}</span>

          <ChevronDown size={14} />
        </button>
      </div>
    </header>
  );
}

/* =========================================================
   EMAIL CARD
   ========================================================= */

function EmailCard({
  email,
  onOpen,
  onStar,
  onArchive,
  onDelete,
  onSnooze
}) {
  return (
    <div className={`email-row ${email.unread ? "unread" : ""}`}>
      <button
        className={`email-star ${email.starred ? "starred" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onStar(email.id);
        }}
        title={email.starred ? "Unstar" : "Star"}
      >
        <Star
          size={16}
          fill={email.starred ? "currentColor" : "none"}
        />
      </button>

      <div
        className="email-main"
        onClick={() => onOpen(email)}
      >
        <div className="email-top">
          <span className="email-sender">
            {email.sender}
          </span>

          <span className="email-date">
            {email.date}
          </span>
        </div>

        <div className="email-subject">
          {email.subject}
        </div>

        <div className="email-preview">
          {email.body}
        </div>
      </div>

      <div className="email-actions">
        <button
          className="email-action"
          title="Archive"
          onClick={(e) => {
            e.stopPropagation();
            onArchive(email.id);
          }}
        >
          <Archive size={15} />
        </button>

        <button
          className="email-action"
          title="Snooze for 1 day"
          onClick={(e) => {
            e.stopPropagation();
            onSnooze(email.id);
          }}
        >
          <Clock size={15} />
        </button>

        <button
          className="email-action danger"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(email.id);
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   FILTERS
   ========================================================= */

function Filters({ filters, setFilters }) {
  return (
    <div className="mail-filters">
      <div className="filter-title-row">
        <span className="filter-title">
          Smart Filters
        </span>

        <button
          className="clear-filters"
          onClick={() =>
            setFilters({
              date: "all",
              sender: "",
              keyword: "",
              read: "all"
            })
          }
        >
          Clear filters
        </button>
      </div>

      <div className="filter-controls">
        <select
          value={filters.date}
          onChange={(e) =>
            setFilters({
              ...filters,
              date: e.target.value
            })
          }
        >
          <option value="all">Any date</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="last-10">Last 10 days</option>
          <option value="last-30">Last 30 days</option>
        </select>

        <div className="filter-field">
          <input
            value={filters.sender}
            onChange={(e) =>
              setFilters({
                ...filters,
                sender: e.target.value
              })
            }
            placeholder="Sender"
          />
        </div>

        <div className="filter-field">
          <input
            value={filters.keyword}
            onChange={(e) =>
              setFilters({
                ...filters,
                keyword: e.target.value
              })
            }
            placeholder="Keyword"
          />
        </div>

        <select
          value={filters.read}
          onChange={(e) =>
            setFilters({
              ...filters,
              read: e.target.value
            })
          }
        >
          <option value="all">Read status</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>
    </div>
  );
}

/* =========================================================
   MAIL PAGE
   ========================================================= */

function MailPage({
  emails,
  activeFolder,
  setActiveFolder,
  search,
  filters,
  setFilters,
  onOpen,
  onStar,
  onArchive,
  onDelete,
  onSnooze
}) {
  const visibleEmails = useMemo(() => {
    const now = Date.now();

    let result = emails.filter((email) => {
      if (activeFolder === "Inbox") {
        return (
          email.folder === "Inbox" &&
          !email.archived &&
          !email.trash &&
          !email.snoozedUntil
        );
      }

      if (activeFolder === "Starred") {
        return email.starred && !email.trash;
      }

      if (activeFolder === "Snoozed") {
        return (
          email.snoozedUntil &&
          email.snoozedUntil > now &&
          !email.trash
        );
      }

      if (activeFolder === "Sent") {
        return email.folder === "Sent" && !email.trash;
      }

      if (activeFolder === "Drafts") {
        return email.folder === "Drafts" && !email.trash;
      }

      if (activeFolder === "Trash") {
        return email.trash || email.folder === "Trash";
      }

      if (activeFolder === "All Mail") {
        return !email.trash;
      }

      return false;
    });

    const nowDate = Date.now();

    if (filters.date !== "all") {
      result = result.filter((email) => {
        const age =
          nowDate - email.timestamp;

        if (filters.date === "today") {
          return age <= 24 * 60 * 60 * 1000;
        }

        if (filters.date === "week") {
          return age <= 7 * 24 * 60 * 60 * 1000;
        }

        if (filters.date === "last-10") {
          return age <= 10 * 24 * 60 * 60 * 1000;
        }

        if (filters.date === "last-30") {
          return age <= 30 * 24 * 60 * 60 * 1000;
        }

        return true;
      });
    }

    if (filters.sender.trim()) {
      const sender = safeText(filters.sender).toLowerCase();

      result = result.filter(
        (email) =>
          safeText(email.sender).toLowerCase().includes(sender) ||
          safeText(email.email).toLowerCase().includes(sender)
      );
    }

    if (filters.keyword.trim()) {
      const keyword = safeText(filters.keyword).toLowerCase();

      result = result.filter(
        (email) =>
          safeText(email.subject).toLowerCase().includes(keyword) ||
          safeText(email.body).toLowerCase().includes(keyword)
      );
    }

    if (filters.read === "unread") {
      result = result.filter((email) => email.unread);
    }

    if (filters.read === "read") {
      result = result.filter((email) => !email.unread);
    }

    if (search.trim()) {
      const query = safeText(search).toLowerCase();

      result = result.filter(
        (email) =>
          safeText(email.sender).toLowerCase().includes(query) ||
          safeText(email.email).toLowerCase().includes(query) ||
          safeText(email.subject).toLowerCase().includes(query) ||
          safeText(email.body).toLowerCase().includes(query)
      );
    }

    return result;
  }, [
    emails,
    activeFolder,
    search,
    filters
  ]);

  return (
    <div className="mail-page">
      <div className="mail-header">
        <div>
          <h1 className="mail-title">
            {activeFolder}
          </h1>

          <div className="mail-subtitle">
            {visibleEmails.length} email
            {visibleEmails.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <Filters
        filters={filters}
        setFilters={setFilters}
      />

      <div className="email-list">
        {visibleEmails.length === 0 ? (
          <div className="empty-state">
            <Mail size={30} />

            <strong>
              No emails found
            </strong>

            <span>
              Try changing the filters or search.
            </span>
          </div>
        ) : (
          visibleEmails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              onOpen={onOpen}
              onStar={onStar}
              onArchive={onArchive}
              onDelete={onDelete}
              onSnooze={onSnooze}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* =========================================================
   EMAIL READER
   ========================================================= */

function EmailReader({
  email,
  onBack,
  onReply,
  onForward,
  onArchive,
  onDelete,
  onSnooze
}) {
  return (
    <div className="reader-page">
      <div className="reader-top">
        <button
          className="back-button"
          onClick={onBack}
        >
          <ChevronLeft size={17} />
        </button>

        <span
          style={{
            fontSize: 11,
            color: "var(--muted)"
          }}
        >
          Email
        </span>
      </div>

      <div className="reader-card">
        <div className="reader-header">
          <h2 className="reader-subject">
            {email.subject}
          </h2>

          <div className="reader-meta">
            <strong>{email.sender}</strong>
            <span>&lt;{email.email}&gt;</span>
            <span>•</span>
            <span>{email.date}</span>
          </div>
        </div>

        <div className="reader-body">
          {email.body}
        </div>

        <div className="reader-actions">
          <button
            className="compose-secondary"
            onClick={onReply}
          >
            <Reply size={13} /> Reply
          </button>

          <button
            className="compose-secondary"
            onClick={onForward}
          >
            Forward
          </button>

          <button
            className="compose-secondary"
            onClick={() => onSnooze(email.id)}
          >
            <Clock size={13} /> Snooze
          </button>

          <button
            className="compose-secondary"
            onClick={() => onArchive(email.id)}
          >
            <Archive size={13} /> Archive
          </button>

          <button
            className="compose-secondary"
            onClick={() => onDelete(email.id)}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   COMPOSE
   ========================================================= */

function ComposeModal({
  compose,
  setCompose,
  onSend,
  onSaveDraft
}) {
  if (!compose.open) return null;

  const title =
    compose.mode === "reply"
      ? "Reply"
      : compose.mode === "forward"
      ? "Forward"
      : "New Message";

  const reset = () => {
    setCompose({
      open: false,
      mode: "new",
      to: "",
      subject: "",
      body: "",
      attachments: []
    });
  };

  return (
    <div className="modal-overlay">
      <div className="compose-window">
        <div className="compose-header">
          <strong>{title}</strong>

          <button
            className="compose-close"
            onClick={reset}
          >
            <X size={16} />
          </button>
        </div>

        <div className="compose-form">
          <div className="compose-field">
            <label>To</label>

            <input
              value={compose.to}
              onChange={(e) =>
                setCompose({
                  ...compose,
                  to: e.target.value
                })
              }
              placeholder="recipient@example.com"
            />
          </div>

          <div className="compose-field">
            <label>Subject</label>

            <input
              value={compose.subject}
              onChange={(e) =>
                setCompose({
                  ...compose,
                  subject: e.target.value
                })
              }
              placeholder="Subject"
            />
          </div>

          <textarea
            className="compose-body"
            value={compose.body}
            onChange={(e) =>
              setCompose({
                ...compose,
                body: e.target.value
              })
            }
            placeholder="Write your message..."
          />

          {compose.attachments.length > 0 && (
            <div className="compose-attachments">
              {compose.attachments.map(
                (file, index) => (
                  <div
                    className="attachment-chip"
                    key={index}
                  >
                    <Paperclip size={10} />{" "}
                    {typeof file === "string" ? file : file.name}
                  </div>
                )
              )}
            </div>
          )}

          <div className="compose-footer">
            <div className="compose-left-actions">
              <>
                <input
                  id="nebula-attachment-input"
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach((file) => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = String(reader.result || "");
                        setCompose((current) => ({
                          ...current,
                          attachments: [
                            ...current.attachments,
                            {
                              name: file.name,
                              type: file.type || "application/octet-stream",
                              size: file.size,
                              data: dataUrl
                            }
                          ]
                        }));
                      };
                      reader.readAsDataURL(file);
                    });
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="compose-secondary"
                  onClick={() =>
                    document.getElementById("nebula-attachment-input")?.click()
                  }
                >
                  <Paperclip size={13} /> Attach
                </button>
              </>
            </div>

            <div className="compose-right-actions">
              <button
                className="compose-secondary"
                onClick={onSaveDraft}
              >
                Save Draft
              </button>

              <button
                className="compose-secondary"
                onClick={reset}
              >
                Cancel
              </button>

              <button
                className="compose-primary"
                onClick={onSend}
              >
                <Send size={13} /> Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   AI SIDEBAR
   ========================================================= */

function AISidebar({
  messages,
  command,
  setCommand,
  onRun
}) {
  const examples = [
    "Send an email to john@example.com with subject 'Meeting Tomorrow' and body 'Let's meet at 3pm'.",
    "Show me emails from the last 10 days",
    "Find the email from Sarah about the project update",
    "Open the latest email from David",
    "Show only unread emails"
  ];

  const submit = () => {
    if (!command.trim()) return;
    onRun(command);
  };

  return (
    <aside className="ai-sidebar">
      <div className="ai-header">
        <div className="ai-logo">
          <Zap size={18} />
        </div>

        <div className="ai-title">
          <strong>AI Assistant</strong>
          <span>Control your mailbox with natural language</span>
        </div>

        <div className="ai-status">
          <span className="ai-status-dot" />
          Ready
        </div>
      </div>

      <div className="ai-messages">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`ai-message ${
              message.role === "user"
                ? "user"
                : "ai"
            }`}
          >
            <strong>
              {message.role === "user"
                ? "You"
                : "Nebula AI"}
            </strong>

            {message.text}
          </div>
        ))}
      </div>

      <div className="ai-input-area">
        <div className="ai-input-box">
          <textarea
            value={command}
            onChange={(e) =>
              setCommand(e.target.value)
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey
              ) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask AI to compose, search, filter or manage email..."
          />

          <button
            className="ai-send-button"
            onClick={submit}
            title="Run AI command"
          >
            <Send size={15} />
          </button>
        </div>
      </div>

      <div className="ai-examples">
        <div className="ai-examples-title">
          TRY THESE
        </div>

        {examples.map((example, index) => (
          <button
            key={index}
            className="ai-example"
            onClick={() =>
              setCommand(example)
            }
          >
            {example}
          </button>
        ))}
      </div>

      <div className="ai-footer">
        <ShieldCheck size={12} />
        AI actions are reviewed before sending.
      </div>
    </aside>
  );
}

/* =========================================================
   PROFILE PAGE
   ========================================================= */

function ProfilePage({
  profileName,
  setProfileName,
  profileEmail,
  setProfileEmail
}) {
  const [name, setName] = useState(profileName);
  const [email, setEmail] = useState(profileEmail);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(profileName);
    setEmail(profileEmail);
  }, [profileName, profileEmail]);

  const save = () => {
    setProfileName(
      name.trim() || "Swathi"
    );

    setProfileEmail(
      email.trim() || "swathi@example.com"
    );

    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 1800);
  };

  return (
    <div className="page-container">
      <div className="page-card">
        <h2>Profile</h2>

        <p>
          Manage your Nebula Mail profile information.
        </p>

        <div className="profile-large-avatar">
          {(name || "S").charAt(0).toUpperCase()}
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <strong>Name</strong>
            <span>Your display name</span>
          </div>

          <input
            className="settings-input"
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
          />
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <strong>Email</strong>
            <span>Your email address</span>
          </div>

          <input
            className="settings-input"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
          />
        </div>

        <button
          className="save-button"
          onClick={save}
        >
          {saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   SETTINGS PAGE
   ========================================================= */

function SettingsPage({
  darkMode,
  setDarkMode,
  gmailConnected,
  onConnectGmail,
  onLogoutGmail
}) {
  return (
    <div className="page-container">
      <div className="page-card">
        <h2>Settings</h2>

        <p>
          Configure your Nebula Mail experience.
        </p>

        <div className="settings-row">
          <div className="settings-label">
            <strong>Dark Mode</strong>
            <span>
              Use a darker interface.
            </span>
          </div>

          <button
            className="compose-secondary"
            onClick={() =>
              setDarkMode(!darkMode)
            }
          >
            {darkMode ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <strong>AI Assistant</strong>
            <span>
              Natural-language mailbox control.
            </span>
          </div>

          <span
            style={{
              fontSize: 11,
              color: "var(--success)"
            }}
          >
            Active
          </span>
        </div>

        <div className="settings-row">
          <div className="settings-label">
            <strong>Gmail Account</strong>
            <span>
              {gmailConnected
                ? "Your real Gmail account is connected."
                : "Connect Nebula Mail to your real Gmail inbox."}
            </span>
          </div>

          {gmailConnected ? (
            <button
              className="compose-secondary"
              onClick={onLogoutGmail}
            >
              Connected ✓
            </button>
          ) : (
            <button
              className="compose-primary"
              onClick={onConnectGmail}
            >
              Connect Gmail
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN APP
   ========================================================= */

export default function App() {
  const [emails, setEmails] =
    useState(initialEmails);

  const [activeFolder, setActiveFolder] =
    useState("Inbox");

  const [selectedEmail, setSelectedEmail] =
    useState(null);

  const [search, setSearch] =
    useState("");

  const [filters, setFilters] = useState({
    date: "all",
    sender: "",
    keyword: "",
    read: "all"
  });

  const [darkMode, setDarkMode] =
    useState(false);

  const [compose, setCompose] = useState({
    open: false,
    mode: "new",
    to: "",
    subject: "",
    body: "",
    attachments: []
  });

  const [command, setCommand] =
    useState("");

  const [messages, setMessages] = useState([
    {
      role: "ai",
      text:
        "Hi Swathi! I can compose emails, search your mailbox, apply filters, open messages, reply, forward, archive, delete and snooze emails."
    }
  ]);

  const [profileName, setProfileName] =
    useState("Swathi");

  const [profileEmail, setProfileEmail] =
    useState("swathi@example.com");

  const [gmailConnected, setGmailConnected] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadGmailStatus = async () => {
      try {
        const statusResponse = await fetch(
          "http://localhost:3001/api/auth/status",
          {
            credentials: "include"
          }
        );

        const status = await statusResponse.json();

        if (cancelled) return;

        setGmailConnected(Boolean(status.connected));

        if (status.connected) {
          const profileResponse = await fetch(
            "http://localhost:3001/api/gmail/profile",
            {
              credentials: "include"
            }
          );

          if (profileResponse.ok) {
            const data = await profileResponse.json();
            const realEmail =
              data?.profile?.emailAddress;

            if (!cancelled && realEmail) {
              setProfileEmail(realEmail);

              // Gmail's profile endpoint gives the real
              // mailbox address. Keep the existing display
              // name unless a separate Google profile name
              // endpoint is added later.
              if (profileName === "Swathi") {
                setProfileName(
                  realEmail
                    .split("@")[0]
                    .replace(/[._-]+/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())
                );
              }
            }
          }
        }
      } catch (error) {
        console.error(
          "Unable to check Gmail connection:",
          error
        );
      }
    };

    loadGmailStatus();

    return () => {
      cancelled = true;
    };
  }, []);
  // Load Inbox + Sent together after Gmail authentication.
  // The backend uses Gmail metadata for the list, so the first paint is fast.
  useEffect(() => {
    if (!gmailConnected) return;

    let cancelled = false;

    const loadMailbox = async () => {
      try {
        const [inboxResponse, sentResponse] = await Promise.all([
          fetch("http://localhost:3001/api/gmail/inbox", {
            credentials: "include"
          }),
          fetch("http://localhost:3001/api/gmail/sent", {
            credentials: "include"
          })
        ]);

        const [inboxData, sentData] = await Promise.all([
          inboxResponse.json(),
          sentResponse.json()
        ]);

        if (!inboxResponse.ok || !inboxData.success) {
          throw new Error(
            inboxData.message || "Failed to load Gmail inbox"
          );
        }

        if (!sentResponse.ok || !sentData.success) {
          throw new Error(
            sentData.message || "Failed to load Gmail Sent"
          );
        }

        if (!cancelled) {
          const inbox = Array.isArray(inboxData.emails)
            ? inboxData.emails
            : [];
          const sent = Array.isArray(sentData.emails)
            ? sentData.emails
            : [];

          setEmails([...inbox, ...sent].sort(
            (a, b) => b.timestamp - a.timestamp
          ));
        }
      } catch (error) {
        console.error("Failed to load Gmail mailbox:", error);
      }
    };

    loadMailbox();

    return () => {
      cancelled = true;
    };
  }, [gmailConnected]);

  useEffect(() => {
    if (!gmailConnected) return;

    let cancelled = false;

    const loadGmailDrafts = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/gmail/drafts",
          { credentials: "include" }
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Failed to load Gmail drafts");
        }

        if (!cancelled && Array.isArray(data.emails)) {
          setEmails((prev) => [
            ...data.emails,
            ...prev.filter((email) => email.folder !== "Drafts")
          ]);
        }
      } catch (error) {
        console.error("Failed to load Gmail drafts:", error);
      }
    };

    loadGmailDrafts();

    return () => {
      cancelled = true;
    };
  }, [gmailConnected]);


  const connectGmail = () => {
    window.location.href =
      "http://localhost:3001/auth/google";
  };

  const logoutGmail = async () => {
    try {
      await fetch(
        "http://localhost:3001/api/auth/logout",
        {
          method: "POST",
          credentials: "include"
        }
      );
    } catch (error) {
      console.error(
        "Gmail logout error:",
        error
      );
    }

    setGmailConnected(false);
    setProfileName("Swathi");
    setProfileEmail("swathi@example.com");
  };

  const unreadCount = emails.filter(
    (email) =>
      email.folder === "Inbox" &&
      email.unread &&
      !email.trash &&
      !email.archived &&
      !email.snoozedUntil
  ).length;

  /* =======================================================
     OPEN EMAIL
     ======================================================= */

  const openEmail = async (email) => {
    if (email.folder === "Drafts") {
      setCompose({
        open: true,
        mode: "new",
        draftId: email.draftId || "",
        to: email.to || email.recipient || "",
        subject: email.subject === "(No subject)" ? "" : safeText(email.subject),
        body: safeText(email.body),
        attachments: Array.isArray(email.attachments) ? email.attachments : []
      });
      return;
    }

    setEmails((prev) =>
      prev.map((item) =>
        item.id === email.id
          ? { ...item, unread: false }
          : item
      )
    );

    setSelectedEmail({
      ...email,
      unread: false
    });

    if (!gmailConnected || !email.id || String(email.id).startsWith("draft-")) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/gmail/message/${encodeURIComponent(email.id)}`,
        { credentials: "include" }
      );

      const data = await parseJsonResponse(response);
      if (!data.email) return;

      setSelectedEmail(data.email);
      setEmails((prev) =>
        prev.map((item) =>
          item.id === data.email.id ? data.email : item
        )
      );

      await fetch(
        `http://localhost:3001/api/gmail/message/${encodeURIComponent(email.id)}/read`,
        {
          method: "POST",
          credentials: "include"
        }
      );
    } catch (error) {
      console.error("Open email error:", error);
    }
  };

  /* =======================================================
     STAR
     ======================================================= */

  const starEmail = (id) => {
    setEmails((prev) =>
      prev.map((email) =>
        email.id === id
          ? {
              ...email,
              starred: !email.starred
            }
          : email
      )
    );

    setSelectedEmail((current) =>
      current?.id === id
        ? {
            ...current,
            starred: !current.starred
          }
        : current
    );
  };

  /* =======================================================
     ARCHIVE
     ======================================================= */

  const archiveEmail = (id) => {
    setEmails((prev) =>
      prev.map((email) =>
        email.id === id
          ? {
              ...email,
              folder: "Archived",
              archived: true,
              snoozedUntil: null
            }
          : email
      )
    );

    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        text:
          "Email archived. It is still available in All Mail."
      }
    ]);
  };

  /* =======================================================
     DELETE
     ======================================================= */

  const deleteEmail = (id) => {
    setEmails((prev) =>
      prev.map((email) =>
        email.id === id
          ? {
              ...email,
              folder: "Trash",
              trash: true,
              archived: false,
              snoozedUntil: null
            }
          : email
      )
    );

    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        text: "Email moved to Trash."
      }
    ]);
  };

  /* =======================================================
     SNOOZE
     ======================================================= */

  const snoozeEmail = (id) => {
    const until =
      Date.now() +
      24 * 60 * 60 * 1000;

    setEmails((prev) =>
      prev.map((email) =>
        email.id === id
          ? {
              ...email,
              snoozedUntil: until,
              archived: false
            }
          : email
      )
    );

    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        text:
          "Email snoozed for 1 day."
      }
    ]);
  };

  /* =======================================================
     COMPOSE
     ======================================================= */

  const openCompose = () => {
    setCompose({
      open: true,
      mode: "new",
      to: "",
      subject: "",
      body: "",
      attachments: []
    });
  };

  /* =======================================================
     REPLY
     ======================================================= */

  const openReply = () => {
    if (!selectedEmail) return;

    setCompose({
      open: true,
      mode: "reply",
      to: selectedEmail.email,
      subject: `Re: ${selectedEmail.subject}`,
      body:
        `\n\n--- Original Message ---\n${selectedEmail.body}`,
      attachments: []
    });
  };

  /* =======================================================
     FORWARD
     ======================================================= */

  const openForward = () => {
    if (!selectedEmail) return;

    setCompose({
      open: true,
      mode: "forward",
      to: "",
      subject: `Fwd: ${selectedEmail.subject}`,
      body:
        `\n\n--- Forwarded Message ---\nFrom: ${selectedEmail.sender}\n\n${selectedEmail.body}`,
      attachments: []
    });
  };

  /* =======================================================
     SEND
     ======================================================= */

  const resetCompose = () => {
    setCompose({
      open: false,
      mode: "new",
      to: "",
      subject: "",
      body: "",
      attachments: []
    });
  };

  const parseJsonResponse = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();

    if (!contentType.includes("application/json")) {
      throw new Error(
        `Server returned ${response.status} ${response.statusText}. Restart the backend and try again.`
      );
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("The backend returned invalid JSON.");
    }

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  };

  const sendEmail = async () => {
    if (
      !safeText(compose.to).trim() ||
      !safeText(compose.subject).trim() ||
      !safeText(compose.body).trim()
    ) {
      alert("Please fill To, Subject and Body.");
      return;
    }

    if (!gmailConnected) {
      alert("Please connect Gmail before sending.");
      return;
    }

    if (!window.confirm(`Send this email to ${compose.to}?`)) {
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:3001/api/gmail/send",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            to: compose.to,
            subject: compose.subject,
            body: compose.body,
            attachments: compose.attachments || []
          })
        }
      );

      const data = await parseJsonResponse(response);

      if (data.email) {
        setEmails((prev) => [
          data.email,
          ...prev.filter((email) => email.id !== data.email.id)
        ]);
      }

      resetCompose();

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Email sent successfully through Gmail."
        }
      ]);
    } catch (error) {
      console.error("Send email error:", error);
      alert(`Could not send email: ${error.message}`);
    }
  };

  /* =======================================================
     SAVE DRAFT
     ======================================================= */

  const saveDraft = async () => {
    const empty =
      !safeText(compose.to).trim() &&
      !safeText(compose.subject).trim() &&
      !safeText(compose.body).trim() &&
      (!compose.attachments || compose.attachments.length === 0);

    if (empty) {
      resetCompose();
      return;
    }

    if (!gmailConnected) {
      alert("Please connect Gmail before saving drafts.");
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:3001/api/gmail/drafts",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            draftId: compose.draftId || "",
            to: compose.to,
            subject: compose.subject,
            body: compose.body,
            attachments: compose.attachments || []
          })
        }
      );

      const data = await parseJsonResponse(response);

      const draft = {
        id: data.messageId || `draft-${data.draftId}`,
        draftId: data.draftId,
        folder: "Drafts",
        sender: profileName,
        email: profileEmail,
        recipient: compose.to,
        to: compose.to,
        subject: compose.subject || "(No subject)",
        body: compose.body,
        date: "Just now",
        timestamp: Date.now(),
        unread: false,
        starred: false,
        archived: false,
        trash: false,
        snoozedUntil: null,
        attachments: compose.attachments || []
      };

      setEmails((prev) => [
        draft,
        ...prev.filter((email) => email.draftId !== draft.draftId)
      ]);

      resetCompose();

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Draft saved to Gmail."
        }
      ]);
    } catch (error) {
      console.error("Save draft error:", error);
      alert(`Could not save draft: ${error.message}`);
    }
  };

  /* =======================================================
     AI FILTER
     ======================================================= */

  const applyAIFilters = ({
    date = "all",
    sender = "",
    keyword = "",
    read = "all"
  }) => {
    setActiveFolder("Inbox");

    setSelectedEmail(null);

    setSearch("");

    setFilters({
      date,
      sender,
      keyword,
      read
    });
  };

  /* =======================================================
     AI COMMAND EXECUTION
     ======================================================= */

  const runAI = (input) => {
    const text = input.trim();

    if (!text) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text
      }
    ]);

    const action =
      parseAICommand(text);

    setCommand("");

    /* SEND EMAIL */

    if (action.type === "send_email") {
      setCompose({
        open: true,
        mode: "new",
        to: action.to,
        subject: action.subject,
        body: action.body,
        attachments: []
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            "I filled the compose form. Please review it and press Send."
        }
      ]);

      return;
    }

    /* COMPOSE */

    if (action.type === "compose") {
      openCompose();

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            "Compose window opened."
        }
      ]);

      return;
    }

    /* REPLY */

    if (action.type === "reply") {
      if (!selectedEmail) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text:
              "Please open an email first, then ask me to reply."
          }
        ]);

        return;
      }

      openReply();

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            "Reply form opened for the current email."
        }
      ]);

      return;
    }

    /* FORWARD */

    if (action.type === "forward") {
      if (!selectedEmail) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text:
              "Please open an email first, then ask me to forward it."
          }
        ]);

        return;
      }

      openForward();

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            "Forward form opened."
        }
      ]);

      return;
    }

    /* NAVIGATE */

    if (action.type === "navigate") {
      setActiveFolder(action.folder);
      setSelectedEmail(null);
      setSearch("");

      setFilters({
        date: "all",
        sender: "",
        keyword: "",
        read: "all"
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            `Showing ${action.folder}.`
        }
      ]);

      return;
    }

    /* LAST DAYS */

    if (action.type === "filter") {
      applyAIFilters(action);

      let description = "Applied the requested filter.";

      if (action.date?.startsWith("last-")) {
        description =
          `Showing emails from the last ${action.date.replace(
            "last-",
            ""
          )} days.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: description
        }
      ]);

      return;
    }

    /* LATEST FROM */

    if (action.type === "latest_from") {
      const matches = emails
        .filter(
          (email) =>
            !email.trash &&
            (email.sender
              .toLowerCase()
              .includes(
                safeText(action.sender).toLowerCase()
              ) ||
              email.email
                .toLowerCase()
                .includes(
                  safeText(action.sender).toLowerCase()
                ))
        )
        .sort(
          (a, b) =>
            b.timestamp - a.timestamp
        );

      if (matches.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text:
              `I couldn't find an email from ${action.sender}.`
          }
        ]);

        return;
      }

      openEmail(matches[0]);

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            `Opened the latest email from ${matches[0].sender}.`
        }
      ]);

      return;
    }

    /* SEARCH */

    if (action.type === "search") {
      setActiveFolder("All Mail");
      setSelectedEmail(null);
      setSearch(action.keyword);

      setFilters({
        date: "all",
        sender: "",
        keyword: "",
        read: "all"
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            `Searching All Mail for "${action.keyword}".`
        }
      ]);

      return;
    }

    /* OPEN */

    if (action.type === "open") {
      const keyword =
        safeText(action.keyword).toLowerCase();

      const found = emails.find(
        (email) =>
          !email.trash &&
          (email.subject
            .toLowerCase()
            .includes(keyword) ||
            email.sender
              .toLowerCase()
              .includes(keyword))
      );

      if (!found) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text:
              "I couldn't find that email."
          }
        ]);

        return;
      }

      openEmail(found);

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            `Opened "${found.subject}".`
        }
      ]);

      return;
    }

    /* MARK READ / UNREAD */

    if (action.type === "mark_read" || action.type === "mark_unread") {
      if (!selectedEmail) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: "Please open an email first."
          }
        ]);
        return;
      }

      const unread = action.type === "mark_unread";

      setEmails((prev) =>
        prev.map((email) =>
          email.id === selectedEmail.id
            ? { ...email, unread }
            : email
        )
      );

      setSelectedEmail((current) =>
        current?.id === selectedEmail.id
          ? { ...current, unread }
          : current
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: unread
            ? "Marked as unread in the current mailbox view."
            : "Marked as read."
        }
      ]);

      return;
    }

    /* CLEAR SEARCH / FILTERS */

    if (action.type === "clear_filters") {
      setSearch("");
      setFilters({
        date: "all",
        sender: "",
        keyword: "",
        read: "all"
      });
      setSelectedEmail(null);

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Cleared search and filters."
        }
      ]);

      return;
    }

    /* ARCHIVE CURRENT */

    if (action.type === "archive_current") {
      if (!selectedEmail) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text:
              "Please open an email first."
          }
        ]);

        return;
      }

      archiveEmail(selectedEmail.id);
      return;
    }

    /* DELETE CURRENT */

    if (action.type === "delete_current") {
      if (!selectedEmail) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text:
              "Please open an email first."
          }
        ]);

        return;
      }

      deleteEmail(selectedEmail.id);
      return;
    }

    /* SNOOZE CURRENT */

    if (action.type === "snooze_current") {
      if (!selectedEmail) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text:
              "Please open an email first."
          }
        ]);

        return;
      }

      snoozeEmail(selectedEmail.id);
      return;
    }

    /* UNKNOWN */

    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        text:
          "I didn't understand that command yet. Try one of the examples below."
      }
    ]);
  };

  /* =======================================================
     CURRENT PAGE
     ======================================================= */

  let pageContent;

  if (activeFolder === "Profile") {
    pageContent = (
      <ProfilePage
        profileName={profileName}
        setProfileName={setProfileName}
        profileEmail={profileEmail}
        setProfileEmail={setProfileEmail}
      />
    );
  } else if (activeFolder === "Settings") {
    pageContent = (
      <SettingsPage
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        gmailConnected={gmailConnected}
        onConnectGmail={connectGmail}
        onLogoutGmail={logoutGmail}
      />
    );
  } else if (selectedEmail) {
    pageContent = (
      <EmailReader
        email={selectedEmail}
        onBack={() =>
          setSelectedEmail(null)
        }
        onReply={openReply}
        onForward={openForward}
        onArchive={() =>
          archiveEmail(selectedEmail.id)
        }
        onDelete={() =>
          deleteEmail(selectedEmail.id)
        }
        onSnooze={() =>
          snoozeEmail(selectedEmail.id)
        }
      />
    );
  } else {
    pageContent = (
      <MailPage
        emails={emails}
        activeFolder={activeFolder}
        setActiveFolder={setActiveFolder}
        search={search}
        filters={filters}
        setFilters={setFilters}
        onOpen={openEmail}
        onStar={starEmail}
        onArchive={archiveEmail}
        onDelete={deleteEmail}
        onSnooze={snoozeEmail}
      />
    );
  }

  return (
    <div
      className={`app ${
        darkMode ? "dark-mode" : ""
      }`}
    >
      <TopBar
        search={search}
        setSearch={setSearch}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        profileName={profileName}
        onProfile={() =>
          setActiveFolder("Profile")
        }
      />

      <Sidebar
        activeFolder={activeFolder}
        setActiveFolder={(folder) => {
          setActiveFolder(folder);
          setSelectedEmail(null);
        }}
        onCompose={openCompose}
        unreadCount={unreadCount}
      />

      <main className="main-content">
        {pageContent}
      </main>

      <AISidebar
        messages={messages}
        command={command}
        setCommand={setCommand}
        onRun={runAI}
      />

      <ComposeModal
        compose={compose}
        setCompose={setCompose}
        onSend={sendEmail}
        onSaveDraft={saveDraft}
      />
    </div>
  );
}