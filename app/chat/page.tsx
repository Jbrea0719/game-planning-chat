"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "user" | "assistant";
  content: string;
  pair_id?: string;
  is_deleted?: boolean;
};

type MessagePair = {
  pair_id: string;
  user: Message;
  assistant: Message;
  is_deleted: boolean;
  detail_content?: string;
  detail_loading?: boolean;
  detail_shown?: boolean;
  timestamp?: string;
};

function getTime() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "오후" : "오전";
  const hour = h % 12 || 12;
  return `${ampm} ${hour}:${m}`;
}

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

function DocImage({ src, alt }: { src?: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed || !src) return null;
  return (
    <figure style={{ margin: "16px 0", textAlign: "center" }}>
      {!loaded && (
        <div
          className="animate-pulse"
          style={{
            height: "180px",
            borderRadius: "8px",
            background: "rgba(192,200,216,0.08)",
            border: "1px solid rgba(192,200,216,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "rgba(192,200,216,0.4)", fontSize: "12px" }}>
            🎨 이미지 생성 중...
          </span>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          display: loaded ? "block" : "none",
          maxWidth: "100%",
          borderRadius: "8px",
          border: "1px solid rgba(192,200,216,0.2)",
          margin: "0 auto",
        }}
      />
      {loaded && alt && (
        <figcaption
          style={{
            fontSize: "11px",
            color: "rgba(192,200,216,0.5)",
            marginTop: "6px",
          }}
        >
          {alt}
        </figcaption>
      )}
    </figure>
  );
}

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#1e3a5f",
            primaryTextColor: "#c0c8d8",
            lineColor: "#7dd3fc",
            background: "#0d1525",
            mainBkg: "#0d1525",
          },
        });
        const id = `m${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        const result = await mermaid.render(id, code);
        if (active) setSvg(result.svg);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => { active = false; };
  }, [code]);

  if (error) return null;
  if (!svg) return (
    <div
      className="animate-pulse"
      style={{
        height: "120px",
        margin: "16px 0",
        borderRadius: "8px",
        background: "rgba(192,200,216,0.06)",
        border: "1px solid rgba(192,200,216,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ color: "rgba(192,200,216,0.4)", fontSize: "12px" }}>
        📊 다이어그램 렌더링 중...
      </span>
    </div>
  );

  return (
    <div
      style={{
        margin: "16px 0",
        overflowX: "auto",
        background: "rgba(10,14,26,0.8)",
        borderRadius: "8px",
        padding: "16px",
        border: "1px solid rgba(192,200,216,0.15)",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// **"텍스트"** 패턴에서 따옴표를 제거해 마크다운 bold가 깨지지 않도록 전처리
function fixMarkdown(text: string): string {
  return text
    .replace(/\*\*"([^"]+)"\*\*/g, "**$1**")
    .replace(/\*\*'([^']+)'\*\*/g, "**$1**");
}

// 토큰 한도 초과로 잘린 경우 불완전한 마지막 줄 제거
function cleanTruncated(text: string): string {
  let clean = text.replace("__TRUNCATED__", "").trimEnd();
  if (/([요다죠네해)]|[!?.。！？])\s*$/.test(clean)) return clean;
  const lastNL = clean.lastIndexOf("\n");
  if (lastNL > 0) return clean.slice(0, lastNL).trimEnd();
  return clean;
}

export default function ChatPage() {
  const [pairs, setPairs] = useState<MessagePair[]>([]);
  const [streamingPair, setStreamingPair] = useState<{ user: string; assistant: string } | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [docContent, setDocContent] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [docEnriched, setDocEnriched] = useState(false);
  const [docImageLoading, setDocImageLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [userProfile, setUserProfile] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCompleteBtn, setShowCompleteBtn] = useState(false);
  const profileUpdateCountRef = useRef(0);
  const userScrolledUpRef = useRef(false);    // 스트리밍 중 사용자가 위로 스크롤했는지
  const isSubLoadingRef = useRef(false);      // loadDetail 진행 중 여부
  const abortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("jordan_nickname");
    if (saved) setSessionId(saved);
    else setShowModal(true);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length > 0) setPairs(groupIntoPairs(data.messages));
      })
      .catch(() => {});
    fetch(`/api/profile?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => { if (data.profile) setUserProfile(data.profile); })
      .catch(() => {});
  }, [sessionId]);

  // 5번 대화마다 프로필 자동 업데이트
  useEffect(() => {
    const activePairs = pairs.filter((p) => !p.is_deleted);
    const count = activePairs.length;
    if (count > 0 && count % 5 === 0 && count !== profileUpdateCountRef.current && sessionId && !isLoading) {
      profileUpdateCountRef.current = count;
      const msgs = activePairs.flatMap((p) => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]);
      fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, messages: msgs, existing_profile: userProfile }),
      })
        .then((r) => r.json())
        .then((data) => { if (data.profile) setUserProfile(data.profile); })
        .catch(() => {});
    }
  }, [pairs, isLoading]);

  // 스트리밍 중 + 사용자가 스크롤 올리지 않았을 때만 자동 하단 이동
  useEffect(() => {
    if (streamingPair !== null && !userScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [streamingPair]);

  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus();
    }
  }, [isLoading]);

  function scrollToBottom() {
    // smooth 대신 instant (스트리밍 중 부드러운 스크롤이 겹치면 어색함)
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function handleCompleteScroll() {
    setShowCompleteBtn(false);
    scrollToBottom();
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
    // 기본 답변 or 자세한 답변 스트리밍 중 사용자 스크롤 감지
    if (isLoading || isSubLoadingRef.current) {
      if (distFromBottom > 200) {
        userScrolledUpRef.current = true;
      } else if (distFromBottom < 50) {
        // 50px 이내로 내려오면 다시 자동 스크롤 재개
        userScrolledUpRef.current = false;
      }
    }
  }

  function getDetailCache(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem("jordan_detail_cache") ?? "{}"); } catch { return {}; }
  }

  function saveDetailCache(pairId: string, content: string) {
    const cache = getDetailCache();
    cache[pairId] = content;
    localStorage.setItem("jordan_detail_cache", JSON.stringify(cache));
  }

  function groupIntoPairs(messages: Message[]): MessagePair[] {
    const cache = getDetailCache();
    const pairMap = new Map<string, { user?: Message; assistant?: Message; is_deleted: boolean }>();
    const order: string[] = [];
    for (const msg of messages) {
      const pid = msg.pair_id ?? "unknown";
      if (!pairMap.has(pid)) { pairMap.set(pid, { is_deleted: msg.is_deleted ?? false }); order.push(pid); }
      const entry = pairMap.get(pid)!;
      if (msg.role === "user") entry.user = msg;
      else entry.assistant = msg;
      if (msg.is_deleted) entry.is_deleted = true;
    }
    return order.map((pid) => {
      const entry = pairMap.get(pid)!;
      if (!entry.user || !entry.assistant) return null;
      const cached = cache[pid];
      return {
        pair_id: pid, user: entry.user, assistant: entry.assistant, is_deleted: entry.is_deleted,
        ...(cached ? { detail_content: cached, detail_shown: true } : {}),
      };
    }).filter(Boolean) as MessagePair[];
  }

  function confirmNickname() {
    const trimmed = nicknameInput.trim();
    if (!trimmed) return;
    localStorage.setItem("jordan_nickname", trimmed);
    setSessionId(trimmed);
    setShowModal(false);
  }

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    const pairId = crypto.randomUUID();
    const time = getTime();
    const allMessages = [
      ...pairs.filter(p => !p.is_deleted).flatMap(p => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]),
      { role: "user" as const, content: trimmed },
    ];
    setStreamingPair({ user: trimmed, assistant: "" });
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.focus(); }
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    userScrolledUpRef.current = false; // 새 질문 시작 시 초기화

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, session_id: sessionId, pair_id: pairId, user_profile: userProfile }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("오류");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value);
        // 화면에는 __TRUNCATED__ 마커 제외하고 표시
        setStreamingPair({ user: trimmed, assistant: assistantText.replace("__TRUNCATED__", "") });
      }

      // 토큰 한도 초과 처리
      if (assistantText.includes("__TRUNCATED__")) {
        assistantText = cleanTruncated(assistantText);
      }

      const hadScrolledUp = userScrolledUpRef.current;
      userScrolledUpRef.current = false;
      setPairs((prev) => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: trimmed, pair_id: pairId },
        assistant: { role: "assistant", content: assistantText, pair_id: pairId },
        is_deleted: false,
        timestamp: time,
      }]);
      setStreamingPair(null);
      if (hadScrolledUp) {
        setShowCompleteBtn(true);
      } else {
        scrollToBottom();
      }
    } catch {
      // AbortError면 조용히 처리
      setStreamingPair(null);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }

  // 질문 실수: 스트리밍 중단 + 질문·답변 모두 버림
  function cancelAndDiscard() {
    abortControllerRef.current?.abort();
    setStreamingPair(null);
    setInput("");
    userScrolledUpRef.current = false;
    setShowCompleteBtn(false);
  }

  // 질문 수정: 스트리밍 중단 + 질문을 입력창에 복원
  function cancelAndEdit() {
    const question = streamingPair?.user ?? "";
    abortControllerRef.current?.abort();
    setStreamingPair(null);
    setInput(question);
    userScrolledUpRef.current = false;
    setShowCompleteBtn(false);
  }

  async function loadDetail(pairId: string) {
    const pair = pairs.find((p) => p.pair_id === pairId);
    if (!pair) return;
    if (pair.detail_content) {
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_shown: !p.detail_shown } : p));
      return;
    }
    isSubLoadingRef.current = true;
    userScrolledUpRef.current = false;
    setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_loading: true, detail_shown: true } : p));
    try {
      // 이전 대화 기록 제외 — 현재 Q&A만 전달해서 입력 토큰 절약 (출력 공간 확보)
      const context = [
        { role: "user" as const, content: pair.user.content },
        { role: "assistant" as const, content: pair.assistant.content },
        { role: "user" as const, content: "위 답변을 더 자세하고 풍부하게 설명해줘." },
      ];
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: context, detailed: true }),
      });
      if (!response.ok || !response.body) throw new Error("오류");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: text.replace("__TRUNCATED__", "") } : p));
        if (!userScrolledUpRef.current) scrollToBottom();
      }
      const hadScrolledUp = userScrolledUpRef.current;
      const finalDetailText = text.includes("__TRUNCATED__") ? cleanTruncated(text) : text;
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: finalDetailText } : p));
      saveDetailCache(pairId, finalDetailText);
      if (hadScrolledUp) {
        setShowCompleteBtn(true);
      } else {
        scrollToBottom();
      }
    } catch {
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: "오류가 발생했습니다." } : p));
    } finally {
      isSubLoadingRef.current = false;
      userScrolledUpRef.current = false;
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_loading: false } : p));
    }
  }

  async function deletePair(pairId: string) {
    setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, is_deleted: true } : p));
    await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId, is_deleted: true }) });
  }

  async function restorePair(pairId: string) {
    setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, is_deleted: false } : p));
    await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId, is_deleted: false }) });
  }

  async function permanentDeletePair(pairId: string) {
    setPairs((prev) => prev.filter((p) => p.pair_id !== pairId));
    await fetch("/api/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId }) });
  }

  // 삭제된 대화 일괄 영구 삭제
  async function bulkPermanentDelete() {
    const deletedList = pairs.filter((p) => p.is_deleted);
    if (!confirm(`삭제된 대화 ${deletedList.length}개를 모두 영구 삭제할까요?`)) return;
    const ids = deletedList.map((p) => p.pair_id);
    setPairs((prev) => prev.filter((p) => !p.is_deleted));
    await Promise.all(ids.map((id) =>
      fetch("/api/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: id }) })
    ));
  }

  function enterSelectMode() {
    // 선택 모드 진입 시 활성 대화 전체 기본 선택
    const allIds = new Set(pairs.filter((p) => !p.is_deleted).map((p) => p.pair_id));
    setSelectedPairIds(allIds);
    setSelectMode(true);
  }

  function togglePairSelect(pairId: string) {
    setSelectedPairIds((prev) => {
      const next = new Set(prev);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
  }

  function cancelSelectMode() {
    setSelectMode(false);
    setSelectedPairIds(new Set());
  }

  async function generateDocument() {
    const selectedMsgs = pairs
      .filter((p) => !p.is_deleted && selectedPairIds.has(p.pair_id))
      .flatMap((p) => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]);
    if (selectedMsgs.length === 0) return;

    setSelectMode(false);
    setDocContent("");
    setDocEnriched(false);
    setDocLoading(true);
    setShowDocModal(true);

    let finalText = "";
    try {
      const response = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: selectedMsgs }),
      });
      if (!response.ok || !response.body) throw new Error("오류");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        setDocContent(text);
      }
      finalText = text;
    } catch {
      setDocContent("기획서 생성 중 오류가 발생했습니다.");
    } finally {
      setDocLoading(false);
    }

    // 기획서 생성 완료 → 이미지 자동 삽입
    if (finalText) enrichDocWithImages(finalText);
  }

  async function copyDocument() {
    await navigator.clipboard.writeText(docContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function enrichDocWithImages(baseContent?: string) {
    const source = baseContent ?? docContent;
    if (!source || docEnriched || docImageLoading) return;
    setDocImageLoading(true);
    try {
      const res = await fetch("/api/image-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: source }),
      });
      const data = await res.json();
      if (!data.suggestions?.length) return;

      let enriched = source;
      // 뒤에서부터 삽입해서 앞쪽 인덱스가 밀리지 않도록 처리
      const sorted = [...data.suggestions].reverse();
      for (const sug of sorted) {
        const idx = enriched.indexOf(sug.heading);
        if (idx === -1) continue;
        const lineEnd = enriched.indexOf("\n", idx + sug.heading.length);
        if (lineEnd === -1) continue;

        let insertMd = "";
        if (sug.type === "diagram" && sug.mermaid) {
          insertMd = `\n\n\`\`\`mermaid\n${sug.mermaid}\n\`\`\`\n`;
        } else if (sug.type === "mockup" && sug.prompt) {
          const encodedPrompt = encodeURIComponent((sug.prompt as string).slice(0, 300));
          insertMd = `\n\n![${sug.alt}](https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=480&nologo=true&model=flux)\n`;
        }

        if (insertMd) {
          enriched = enriched.slice(0, lineEnd + 1) + insertMd + enriched.slice(lineEnd + 1);
        }
      }
      setDocContent(enriched);
      setDocEnriched(true);
    } catch {
      // 실패 시 조용히 종료
    } finally {
      setDocImageLoading(false);
    }
  }

  function getDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }

  function getUniqueFilename(base: string): string {
    const key = "jordan_filenames";
    const used: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const usedSet = new Set(used);
    let name = base;
    let i = 2;
    while (usedSet.has(name)) { name = `${base}_(${i})`; i++; }
    usedSet.add(name);
    localStorage.setItem(key, JSON.stringify([...usedSet]));
    return name;
  }

  async function getTitle(content: string): Promise<string> {
    try {
      const res = await fetch("/api/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      return data.title || "조던답변";
    } catch { return "조던답변"; }
  }

  async function downloadTxt(content: string) {
    const title = await getTitle(content);
    const filename = getUniqueFilename(`${title}_${getDateStr()}`);
    const clean = content
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^#{1,4}\s+/gm, "")
      .replace(/^[-*]\s+/gm, "• ");
    const blob = new Blob([clean], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename + ".txt"; a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadMd(content: string) {
    const title = await getTitle(content);
    const filename = getUniqueFilename(`${title}_${getDateStr()}`);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename + ".md"; a.click();
    URL.revokeObjectURL(url);
  }

  async function copyMessage(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.altKey) {
      // Alt+Enter → 줄바꿈
      e.preventDefault();
      setInput((prev) => prev + "\n");
    } else if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      // Enter → 전송
      e.preventDefault();
      sendMessage();
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // 높이 자동 조절
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  const activePairs = pairs.filter((p) => !p.is_deleted);
  const deletedPairs = pairs.filter((p) => p.is_deleted);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }}>

      {/* 닉네임 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="rounded-2xl p-8 w-80 shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
                <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-base font-bold" style={{ color: SILVER }}>입장하기</h2>
            </div>
            <p className="text-xs mb-4" style={{ color: SILVER_DIM }}>닉네임을 입력하면 대화 기록이 저장됩니다</p>
            <input
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNickname()}
              placeholder="닉네임 입력"
              autoComplete="off"
              className="w-full px-4 py-2.5 rounded-xl text-sm mb-4 outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
              autoFocus
            />
            <button
              onClick={confirmNickname}
              disabled={!nicknameInput.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
            >
              입장하기
            </button>
          </div>
        </div>
      )}

      {/* 기획서 모달 */}
      {showDocModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}>
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex items-center gap-2">
                <span style={{ color: SILVER }}>📄</span>
                <h2 className="text-sm font-bold" style={{ color: SILVER }}>기획서</h2>
                {docLoading && <span className="text-xs animate-pulse" style={{ color: SILVER_DIM }}>작성 중...</span>}
              </div>
              <div className="flex items-center gap-2">
                {!docLoading && docImageLoading && (
                  <span className="text-xs flex items-center gap-1.5" style={{ color: "#7dd3fc" }}>
                    <span className="animate-pulse">✨</span> 이미지 생성 중...
                  </span>
                )}
                {!docLoading && !docImageLoading && docContent && !docEnriched && (
                  <button
                    onClick={() => enrichDocWithImages()}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ backgroundColor: "rgba(125,211,252,0.15)", border: "1px solid rgba(125,211,252,0.5)", color: "#7dd3fc" }}
                  >
                    ✨ 이미지 추가
                  </button>
                )}
                {!docLoading && docContent && (
                  <button
                    onClick={copyDocument}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ backgroundColor: copied ? "rgba(100,200,100,0.2)" : SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: copied ? "#90d090" : SILVER }}
                  >
                    {copied ? "✓ 복사됨" : "복사"}
                  </button>
                )}
                <button
                  onClick={() => setShowDocModal(false)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
                >
                  닫기
                </button>
              </div>
            </div>
            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
              {docLoading && !docContent && (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <span className="animate-pulse" style={{ color: SILVER_DIM }}>대화 내용을 분석해서 기획서를 작성하고 있어요...</span>
                </div>
              )}
              {docContent && (
                <div className="prose prose-sm max-w-none" style={{ color: "#e0e8f0" }}>
                  <ReactMarkdown
                    components={{
                      img: (props) => <DocImage src={typeof props.src === "string" ? props.src : undefined} alt={props.alt} />,
                      code: ({ className, children }) => {
                        if (/language-mermaid/.test(className ?? "")) {
                          return <MermaidDiagram code={String(children).trim()} />;
                        }
                        return <code className={className}>{children}</code>;
                      },
                    }}
                  >
                    {fixMarkdown(docContent)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header className="px-6 py-4 flex items-center gap-4" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}`, boxShadow: `0 0 15px rgba(192,200,216,0.2)` }}>
          <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="font-bold text-sm" style={{ color: SILVER }}>조던</p>
          <p className="text-xs" style={{ color: SILVER_DIM }}>영웅수집형 게임 기획 전문가 · 가챠 · 밸런스 · BM · 컨텐츠 설계</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {activePairs.length > 0 && !selectMode && (
            <button
              onClick={enterSelectMode}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
            >
              📄 기획서 작성
            </button>
          )}
          {selectMode && (
            <>
              <span className="text-xs" style={{ color: SILVER_DIM }}>{selectedPairIds.size}개 선택됨</span>
              <button
                onClick={generateDocument}
                disabled={selectedPairIds.size === 0}
                className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
              >
                ✓ 작성 시작
              </button>
              <button
                onClick={cancelSelectMode}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
              >
                취소
              </button>
            </>
          )}
          {sessionId && (
            <span className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: SILVER_FAINT, border: `1px solid rgba(192,200,216,0.3)`, color: SILVER }}>
              {sessionId}
            </span>
          )}
        </div>
      </header>

      {/* 대화 영역 */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
        <div className={`max-w-2xl mx-auto space-y-6 ${selectMode ? "pl-8" : ""}`}>

          {activePairs.length === 0 && !streamingPair && (
            <div className="text-center mt-20">
              <div className="w-16 h-16 rounded-full mx-auto overflow-hidden mb-4" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
              <p className="text-sm font-medium" style={{ color: SILVER }}>조던</p>
              <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>영웅수집형 게임 기획 — 가챠 · 밸런스 · BM · 컨텐츠 무엇이든 물어보세요</p>
            </div>
          )}

          {/* 활성 대화 쌍 */}
          {activePairs.map((pair) => (
            <div key={pair.pair_id} className={`space-y-3 group relative ${selectMode ? "cursor-pointer" : ""}`} onClick={selectMode ? () => togglePairSelect(pair.pair_id) : undefined}>
              {/* 선택 모드 체크박스 */}
              {selectMode && (
                <div className="absolute -left-6 top-1 flex items-start">
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: selectedPairIds.has(pair.pair_id) ? SILVER : "transparent", border: `2px solid ${selectedPairIds.has(pair.pair_id) ? SILVER : SILVER_DIM}` }}>
                    {selectedPairIds.has(pair.pair_id) && <span style={{ color: "#0a0e1a", fontSize: "10px", fontWeight: "bold" }}>✓</span>}
                  </div>
                </div>
              )}
              {/* 선택된 대화 하이라이트 */}
              {selectMode && (
                <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ backgroundColor: selectedPairIds.has(pair.pair_id) ? "rgba(192,200,216,0.05)" : "transparent", border: selectedPairIds.has(pair.pair_id) ? `1px solid ${SILVER_FAINT}` : "1px solid transparent" }} />
              )}

              {/* 내 질문 */}
              <div className="flex justify-end items-end gap-2">
                <div className="flex flex-col items-end gap-1">
                  <button onClick={() => deletePair(pair.pair_id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{ color: SILVER_DIM }}>삭제</button>
                  {pair.timestamp && <span className="text-xs" style={{ color: SILVER_DIM }}>{pair.timestamp}</span>}
                </div>
                <div className="relative max-w-[70%]">
                  <button
                    onClick={() => copyMessage(pair.user.content, `${pair.pair_id}-user`)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 flex"
                    style={{ backgroundColor: copiedId === `${pair.pair_id}-user` ? "rgba(100,200,100,0.9)" : "rgba(30,40,60,0.9)", border: `1px solid ${SILVER_FAINT}` }}
                    title="복사"
                  >
                    <span style={{ fontSize: "10px", color: copiedId === `${pair.pair_id}-user` ? "#fff" : SILVER }}>
                      {copiedId === `${pair.pair_id}-user` ? "✓" : "⎘"}
                    </span>
                  </button>
                  <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium whitespace-pre-wrap" style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.2)` }}>
                    {pair.user.content}
                  </div>
                </div>
              </div>

              {/* AI 답변 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <p className="text-xs ml-1" style={{ color: SILVER }}>조던</p>
                  <div className="relative">
                    <button
                      onClick={() => copyMessage(pair.assistant.content, `${pair.pair_id}-assistant`)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 flex"
                      style={{ backgroundColor: copiedId === `${pair.pair_id}-assistant` ? "rgba(100,200,100,0.9)" : "rgba(30,40,60,0.9)", border: `1px solid ${SILVER_FAINT}` }}
                      title="복사"
                    >
                      <span style={{ fontSize: "10px", color: copiedId === `${pair.pair_id}-assistant` ? "#fff" : SILVER }}>
                        {copiedId === `${pair.pair_id}-assistant` ? "✓" : "⎘"}
                      </span>
                    </button>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", backdropFilter: "blur(10px)" }}>
                      <ReactMarkdown>{fixMarkdown(pair.assistant.content)}</ReactMarkdown>
                    </div>
                  </div>
                  {/* 2000자 초과 시 다운로드 버튼 */}
                  {pair.assistant.content.length > 2000 && (
                    <div className="flex items-center gap-2 ml-1 mt-1">
                      <span className="text-xs" style={{ color: SILVER_DIM }}>다운로드:</span>
                      <button
                        onClick={() => downloadTxt(pair.assistant.content)}
                        className="text-xs px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
                      >
                        📄 TXT
                      </button>
                      <button
                        onClick={() => downloadMd(pair.assistant.content)}
                        className="text-xs px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
                      >
                        📝 MD
                      </button>
                    </div>
                  )}
                  <button onClick={() => loadDetail(pair.pair_id)} className="text-xs ml-1 flex items-center gap-1 w-fit" style={{ color: SILVER_DIM }}>
                    {pair.detail_loading
                      ? "⏳ 불러오는 중..."
                      : pair.detail_content?.includes("__NEEDS_FULL__")
                        ? (pair.detail_shown ? "▲ 접기" : "▼ 자세한 답변 보기 (전체는 다운로드)")
                        : (pair.detail_shown ? "▲ 접기" : "▼ 자세한 답변 보기")}
                  </button>
                  {pair.detail_shown && pair.detail_content && (() => {
                    const MARKER = "__NEEDS_FULL__";
                    const markerIdx = pair.detail_content!.indexOf(MARKER);
                    const bubbleText = markerIdx !== -1 ? pair.detail_content!.slice(0, markerIdx).trim() : pair.detail_content!.trim();
                    const fullText   = markerIdx !== -1 ? pair.detail_content!.slice(markerIdx + MARKER.length).trim() : null;
                    return (
                      <div className="flex flex-col gap-2">
                        <div className="relative">
                          <button
                            onClick={() => copyMessage(bubbleText, `${pair.pair_id}-detail`)}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 flex"
                            style={{ backgroundColor: copiedId === `${pair.pair_id}-detail` ? "rgba(100,200,100,0.9)" : "rgba(30,40,60,0.9)", border: `1px solid ${SILVER_FAINT}` }}
                            title="복사"
                          >
                            <span style={{ fontSize: "10px", color: copiedId === `${pair.pair_id}-detail` ? "#fff" : SILVER }}>
                              {copiedId === `${pair.pair_id}-detail` ? "✓" : "⎘"}
                            </span>
                          </button>
                          <div className="px-4 py-3 rounded-2xl text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid rgba(192,200,216,0.25)`, color: "#e0e8f0" }}>
                            <ReactMarkdown>{fixMarkdown(bubbleText)}</ReactMarkdown>
                          </div>
                        </div>
                        {fullText && !pair.detail_loading && (
                          <div className="flex flex-col gap-1 ml-1">
                            <p className="text-xs" style={{ color: SILVER_DIM }}>📎 전체 내용이 길어 요약본을 표시했어요. 전체 답변은 다운로드로 확인하세요.</p>
                            <div className="flex gap-2">
                              <button onClick={() => downloadTxt(fullText)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}>📄 TXT 전체 다운로드</button>
                              <button onClick={() => downloadMd(fullText)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}>📝 MD 전체 다운로드</button>
                            </div>
                          </div>
                        )}
                        {!fullText && !pair.detail_loading && (
                          <div className="flex items-center gap-2 ml-1 mt-1">
                            <span className="text-xs" style={{ color: SILVER_DIM }}>다운로드:</span>
                            <button onClick={() => downloadTxt(bubbleText)} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>📄 TXT</button>
                            <button onClick={() => downloadMd(bubbleText)} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>📝 MD</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}

          {/* 스트리밍 중 */}
          {streamingPair && (
            <div className="space-y-3">
              <div className="flex justify-end items-end gap-2">
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex gap-2">
                    <button
                      onClick={cancelAndEdit}
                      className="text-xs px-3 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "rgba(192,200,216,0.15)", border: `1px solid ${SILVER_DIM}`, color: SILVER }}>
                      ✏️ 질문 수정
                    </button>
                    <button
                      onClick={cancelAndDiscard}
                      className="text-xs px-3 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.35)", color: "#f87171" }}>
                      🗑️ 질문 실수
                    </button>
                  </div>
                </div>
                <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                  {streamingPair.user}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <p className="text-xs ml-1" style={{ color: SILVER }}>조던</p>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                    {streamingPair.assistant
                      ? <ReactMarkdown>{fixMarkdown(streamingPair.assistant)}</ReactMarkdown>
                      : <span style={{ color: SILVER_DIM }} className="animate-pulse">···</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 삭제된 대화 */}
          {deletedPairs.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setShowDeleted(!showDeleted)} className="text-xs flex items-center gap-1 px-3 py-1 rounded-full" style={{ color: SILVER_DIM, backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid ${SILVER_FAINT}` }}>
                  {showDeleted ? "▲" : "▼"} 삭제된 대화 {deletedPairs.length}개
                </button>
                <button onClick={bulkPermanentDelete} className="text-xs flex items-center gap-1 px-3 py-1 rounded-full" style={{ color: "#f87171", backgroundColor: "rgba(255,50,50,0.07)", border: "1px solid rgba(255,50,50,0.2)" }}>
                  🗑️ 일괄 삭제
                </button>
              </div>
              {showDeleted && (
                <div className="space-y-4 mt-3">
                  {deletedPairs.map((pair) => (
                    <div key={pair.pair_id} className="opacity-40 space-y-2">
                      <div className="flex justify-end items-end gap-2">
                        <div className="flex gap-1">
                          <button onClick={() => restorePair(pair.pair_id)} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(192,200,216,0.1)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>↩️ 복원</button>
                          <button onClick={() => { if (confirm("영구 삭제할까요?")) permanentDeletePair(pair.pair_id); }} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.2)", color: "#f87171" }}>🗑️ 영구삭제</button>
                        </div>
                        <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm line-through" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                          {pair.user.content}
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm max-w-[75%]" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                          {pair.assistant.content}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* 답변 완료 바로가기 버튼 */}
      {showCompleteBtn && (
        <button
          onClick={handleCompleteScroll}
          className="fixed bottom-24 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 20px rgba(192,200,216,0.4)` }}
        >
          답변 완료 ↓
        </button>
      )}

      {/* 맨 아래로 버튼 (답변 완료 버튼 없을 때만) */}
      {showScrollBtn && !showCompleteBtn && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-6 w-10 h-10 rounded-full flex items-center justify-center text-base shadow-lg z-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.3)` }}
        >
          ↓
        </button>
      )}

      {/* 입력창 */}
      <div className="px-4 py-3 flex gap-3" style={{ backgroundColor: "rgba(0,0,0,0.5)", borderTop: `1px solid ${SILVER_FAINT}` }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder="게임 기획에 대해 질문하세요... (Enter 전송 / Alt+Enter 줄바꿈)"
          disabled={isLoading}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          rows={1}
          className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
          style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", lineHeight: "1.5", overflowY: "auto" }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-base flex-shrink-0 font-bold disabled:opacity-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.2)` }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
