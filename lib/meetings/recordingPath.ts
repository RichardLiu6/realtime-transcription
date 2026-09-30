// A recording's pathname in storage: meetings/<meeting>/<idx>.<ext> —
// checked on every upload and registration so a meeting's owner can only
// write inside their own meeting.
const PATTERN = /^meetings\/([A-Za-z0-9_-]{22})\/(\d{1,6})\.(webm|m4a|ogg)$/;

export function parseRecordingPath(pathname: string): { meetingId: string; idx: number } | null {
  const m = PATTERN.exec(pathname);
  return m ? { meetingId: m[1], idx: Number(m[2]) } : null;
}
