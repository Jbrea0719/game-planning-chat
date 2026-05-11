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

// **"텍스트"** 패턴에서 따옴표를 제거해 마크다운 bold가 깨지지 않도록 전처리
function fixMarkdown(text: string): string {
  return text
    .replace(/\*\*"([^"]+)"\*\*/g, "**$1**")
    .replace(/\*\*'([^']+)'\*\*/g, "**$1**");
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [pairs, streamingPair]);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  }

  function groupIntoPairs(messages: Message[]): MessagePair[] {
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
      return { pair_id: pid, user: entry.user, assistant: entry.assistant, is_deleted: entry.is_deleted };
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
    setIsLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, session_id: sessionId, pair_id: pairId }),
      });
      if (!response.ok || !response.body) throw new Error("오류");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value);
        setStreamingPair({ user: trimmed, assistant: assistantText });
      }
      setPairs((prev) => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: trimmed, pair_id: pairId },
        assistant: { role: "assistant", content: assistantText, pair_id: pairId },
        is_deleted: false,
        timestamp: time,
      }]);
      setStreamingPair(null);
    } catch {
      setStreamingPair(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(pairId: string) {
    const pair = pairs.find((p) => p.pair_id === pairId);
    if (!pair) return;
    if (pair.detail_content) {
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_shown: !p.detail_shown } : p));
      return;
    }
    setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_loading: true, detail_shown: true } : p));
    try {
      const context = [
        ...pairs.filter(p => !p.is_deleted && p.pair_id !== pairId).flatMap(p => [
          { role: p.user.role, content: p.user.content },
          { role: p.assistant.role, content: p.assistant.content },
        ]),
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
        setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: text } : p));
      }
    } catch {
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: "오류가 발생했습니다." } : p));
    } finally {
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
    setDocLoading(true);
    setShowDocModal(true);

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
    } catch {
      setDocContent("기획서 생성 중 오류가 발생했습니다.");
    } finally {
      setDocLoading(false);
    }
  }

  async function copyDocument() {
    await navigator.clipboard.writeText(docContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}` }}>
                🎯
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
                  <ReactMarkdown>{fixMarkdown(docContent)}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header className="px-6 py-4 flex items-center gap-4" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, boxShadow: `0 0 15px rgba(192,200,216,0.2)` }}>
          🎯
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
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-4xl mb-4" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}` }}>🎯</div>
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
                <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium" style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.2)` }}>
                  {pair.user.content}
                </div>
              </div>

              {/* AI 답변 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}` }}>🎯</div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <p className="text-xs ml-1" style={{ color: SILVER }}>조던</p>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", backdropFilter: "blur(10px)" }}>
                    <ReactMarkdown>{fixMarkdown(pair.assistant.content)}</ReactMarkdown>
                  </div>
                  <button onClick={() => loadDetail(pair.pair_id)} className="text-xs ml-1 flex items-center gap-1 w-fit" style={{ color: SILVER_DIM }}>
                    {pair.detail_loading ? "⏳ 불러오는 중..." : pair.detail_shown ? "▲ 접기" : "▼ 자세한 답변 보기"}
                  </button>
                  {pair.detail_shown && pair.detail_content && (
                    <div className="px-4 py-3 rounded-2xl text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid rgba(192,200,216,0.25)`, color: "#e0e8f0" }}>
                      <ReactMarkdown>{fixMarkdown(pair.detail_content)}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 스트리밍 중 */}
          {streamingPair && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                  {streamingPair.user}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}` }}>🎯</div>
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
              <button onClick={() => setShowDeleted(!showDeleted)} className="text-xs mx-auto flex items-center gap-1 px-3 py-1 rounded-full" style={{ color: SILVER_DIM, backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid ${SILVER_FAINT}` }}>
                {showDeleted ? "▲" : "▼"} 삭제된 대화 {deletedPairs.length}개
              </button>
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
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}` }}>🎯</div>
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

      {/* 맨 아래로 버튼 */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 right-6 w-10 h-10 rounded-full flex items-center justify-center text-base shadow-lg z-40 transition-opacity"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.3)` }}
        >
          ↓
        </button>
      )}

      {/* 입력창 */}
      <div className="px-4 py-3 flex gap-3" style={{ backgroundColor: "rgba(0,0,0,0.5)", borderTop: `1px solid ${SILVER_FAINT}` }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="게임 기획에 대해 질문하세요..."
          disabled={isLoading}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
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
