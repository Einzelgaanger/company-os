import type { ConnectionProvider } from "./types";

export interface ProviderMeta {
  id: ConnectionProvider;
  name: string;
  category: "Email" | "Calendar" | "Storage" | "Meetings" | "Messaging";
  orgLevel?: boolean;
  scopesNote: string;
}

export const PROVIDERS: ProviderMeta[] = [
  { id: "gmail", name: "Gmail", category: "Email", scopesNote: "gmail.readonly" },
  { id: "outlook", name: "Outlook", category: "Email", scopesNote: "Mail.Read" },
  { id: "google_calendar", name: "Google Calendar", category: "Calendar", scopesNote: "calendar.readonly" },
  { id: "microsoft_calendar", name: "Microsoft Calendar", category: "Calendar", scopesNote: "Calendars.Read" },
  { id: "google_drive", name: "Google Drive", category: "Storage", scopesNote: "drive.readonly" },
  { id: "onedrive", name: "OneDrive", category: "Storage", scopesNote: "Files.Read.All" },
  { id: "fathom", name: "Fathom", category: "Meetings", orgLevel: true, scopesNote: "recordings.read" },
  { id: "slack", name: "Slack", category: "Messaging", scopesNote: "channels:history (ingestion only)" },
  { id: "teams", name: "Microsoft Teams", category: "Messaging", scopesNote: "Chat.Read (ingestion only)" },
];
