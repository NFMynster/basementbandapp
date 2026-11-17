import { useEffect, useState } from "react";

export type NoticeTone = "notice" | "warning";

/** Transient footer notices. Each new message restarts its four-second timer. */
export function useNotices() {
  const [notice, setNoticeState] = useState("");
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("notice");
  const [noticeVersion, setNoticeVersion] = useState(0);
  function setNotice(message: string, tone: NoticeTone = "notice") {
    setNoticeState(message);
    setNoticeTone(tone);
    setNoticeVersion((v) => v + 1);
  }
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice, noticeVersion]);
  return { notice, noticeTone, noticeVersion, setNotice };
}

export type Notices = ReturnType<typeof useNotices>;
