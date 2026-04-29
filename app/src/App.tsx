import { useState, useEffect, useCallback } from "react";
import {
  GUMROAD_PRODUCT_URL,
  GumroadPurchaseEvent,
  onGumroadPurchase,
  verifyLicense,
  saveLicense,
  loadLicense,
} from "@/lib/gumroad";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lock,
  Zap,
  X,
  Check,
  Copy,
  ChevronRight,
  Flame,
  ArrowRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

type Authority = "can_refund" | "need_approval" | "de_escalate";

interface ReplyData {
  bad: string;
  goodFirst: string;
  goodRest: string;
  bestMove: string;
  internalAction: string;
}

interface DefuseResult {
  riskLabel: string;
  fearLine: string;
  reply: ReplyData;
}

// ── Authority labels ─────────────────────────────────────────────

const AUTHORITY_TITLES: Record<Authority, string> = {
  can_refund: "I can approve refunds",
  need_approval: "I need approval",
  de_escalate: "De-escalate only",
};

// ── Reply database (human, punchy, adapted by authority) ──────────

function buildReply(msg: string, authority: Authority): DefuseResult {
  const l = msg.toLowerCase();

  // Default
  let riskLabel = "Medium risk — customer is close to leaving";
  let fearLine = "67% of customers like this leave after 2 bad replies";
  let bad = "We're sorry. Please wait while we review your request.";
  let goodFirst = "I hear you — that's on us.";
  let goodRest = "I'm sending a replacement right now, free expedited shipping. Tracking hits your inbox in 10 minutes.";
  let bestMove = "Own the issue immediately. Fix it fast. Confirm a clear timeline.";
  let internalAction = "Create replacement order. Upgrade to expedited shipping. Send tracking within 10 minutes.";

  if (l.includes("scam") || l.includes("fraud") || l.includes("fake")) {
    riskLabel = "Critical — this customer is about to leave";
    fearLine = "90% of customers who say 'scam' file a chargeback within 24 hours";
    bad = "We apologize. Our team will investigate and respond within 3–5 business days.";

    if (authority === "can_refund") {
      goodFirst = "That's on us — completely.";
      goodRest = "I'm processing a full refund right now. No questions. You'll see it in 24 hours. I'll message you personally in 2 days to make sure this never happens again.";
      bestMove = "Take full ownership. Refund immediately. Follow up personally within 48 hours.";
      internalAction = "Process full refund immediately. Flag account for senior follow-up. Document for quality review.";
    } else if (authority === "need_approval") {
      goodFirst = "That's on us — completely.";
      goodRest = "I'm submitting your full refund for urgent approval right now. It'll hit your account within 24 hours of approval. I'll personally update you the moment it's confirmed.";
      bestMove = "Take ownership. Fast-track refund approval. Over-communicate every step.";
      internalAction = "Submit urgent refund request to billing. CC manager. Set 4-hour reminder for status update.";
    } else {
      goodFirst = "That's on us — completely.";
      goodRest = "While I escalate this for priority review, I'm sending you a replacement + $25 credit immediately. A supervisor will call you within 2 hours with a resolution.";
      bestMove = "Own it fully. Offer immediate non-refund compensation. Escalate refund request personally.";
      internalAction = "Escalate to senior support with URGENT tag. Create goodwill package. Schedule supervisor callback within 2 hours.";
    }
  } else if (l.includes("refund") || l.includes("money back") || l.includes("chargeback")) {
    riskLabel = "Critical — this customer is about to leave";
    fearLine = "73% of refund requests become chargebacks if not fixed in the first reply";
    bad = "Thank you. We have received your refund request and will process it within 5–7 business days.";

    if (authority === "can_refund") {
      goodFirst = "I get it — I'd want my money back too.";
      goodRest = "Here's what I'm doing right now: 50% refund is hitting your account today. Replacement ships free, overnight. You'll have tracking in 20 minutes.";
      bestMove = "Offer partial refund + replacement immediately. Don't make them wait or escalate.";
      internalAction = "Process partial refund now. Create replacement order with overnight shipping. Send tracking link within 20 minutes.";
    } else if (authority === "need_approval") {
      goodFirst = "I get it — I'd want my money back too.";
      goodRest = "I've escalated your refund to our billing team with URGENT priority. While they approve it, I'm sending a replacement order right now — free, overnight. I'll message you personally within 4 hours with the refund confirmation.";
      bestMove = "Promise a clear timeline. Ship replacement immediately. Over-communicate approval status.";
      internalAction = "Submit urgent refund request. Create replacement order immediately. Set 4-hour reminder to update customer.";
    } else {
      goodFirst = "I get it — I'd want my money back too.";
      goodRest = "While I work on getting you the best resolution, I'm sending a replacement order immediately at no charge, plus adding $20 store credit. A supervisor will review your refund request personally and contact you within 6 hours.";
      bestMove = "Offer maximum non-refund value immediately. Escalate refund to supervisor personally.";
      internalAction = "Create replacement order. Add $20 store credit. Escalate refund to supervisor with customer context. Set 6-hour follow-up.";
    }
  } else if (l.includes("terrible") || l.includes("worst") || l.includes("hate")) {
    riskLabel = "High risk — customer is close to leaving";
    fearLine = "Strong emotional language = 4x more likely to post a public 1-star review";
    bad = "We are sorry to hear you are dissatisfied. We will look into this matter.";
    goodFirst = "You're right to be mad — this isn't what we promised.";
    goodRest = "Here's the fix: replacement ships today, handwritten note included, and I'm CC'ing our product lead so this doesn't happen again. Tracking in an hour.";
    bestMove = "Validate their anger. Fix immediately. Show them you're preventing it from happening again.";
    internalAction = "Create replacement order with expedited shipping. Draft handwritten apology note. Escalate to product team. Send tracking within the hour.";
  } else if (l.includes("slow") || l.includes("late") || l.includes("shipping") || l.includes("delivery")) {
    riskLabel = "High risk — customer is close to leaving";
    fearLine = "Shipping complaints have the highest public review rate — customers tell everyone";
    bad = "We apologize for the delay. Shipping times can vary based on carrier availability.";
    goodFirst = "You're right — we wasted your time, and that's not okay.";
    goodRest = "I just upgraded you to overnight, free. $10 credit added to your account. Real tracking link is in your inbox now.";
    bestMove = "Apologize for wasting their time. Upgrade shipping immediately. Add credit as gesture.";
    internalAction = "Upgrade shipping to overnight at no charge. Add $10 store credit. Send real tracking update immediately. Review carrier SLA.";
  } else if (l.includes("broken") || l.includes("damaged") || l.includes("defective")) {
    riskLabel = "Medium risk — customer is close to leaving";
    fearLine = "Product damage complaints lead to refunds 60% of the time if not handled fast";
    bad = "Please send photos of the damage so our team can assess whether this qualifies for a replacement.";
    goodFirst = "A broken product reaching you is unacceptable — period.";
    goodRest = "New one ships today, free overnight. Prepaid return label is in your inbox. Zero hassle.";
    bestMove = "No questions asked. Ship replacement immediately. Remove all friction for the customer.";
    internalAction = "Create replacement order with overnight shipping. Email prepaid return label. Flag warehouse QC for packaging review.";
  } else if (l.includes("cancel") || l.includes("unsubscribe") || l.includes("stop")) {
    riskLabel = "High risk — customer is close to leaving";
    fearLine = "Subscription cancellations cost 5x more than one-time refunds over a customer's lifetime";
    bad = "We have processed your cancellation. You will receive a confirmation email shortly.";
    goodFirst = "Before we close this — let me freeze your account for 60 days instead.";
    goodRest = "Everything stays: data, settings, history. One click to resume. And I'll add a free month when you come back. Deal?";
    bestMove = "Don't let them cancel. Offer a pause with incentive to return. Make it effortless.";
    internalAction = "Pause subscription for 60 days (do not cancel). Add free month credit to account. Activate win-back sequence in 30 days.";
  } else if (l.includes("expensive") || l.includes("overpriced") || l.includes("price")) {
    riskLabel = "Medium risk — customer is close to leaving";
    fearLine = "Price objections are buying signals — handle right and they stay loyal";
    bad = "Our pricing reflects the quality we provide. We do not offer discounts outside of promotional periods.";
    goodFirst = "Appreciate you keeping it real on price — that helps us improve.";
    goodRest = "15% loyalty discount applied to your next 3 orders, starting now. If that still doesn't work, we'll figure something out together.";
    bestMove = "Acknowledge their concern. Offer an exclusive loyalty discount. Keep the door open.";
    internalAction = "Apply 15% loyalty discount to next 3 orders. Add to price-sensitivity segment. Trigger personalized offer in 48 hours if they don't reorder.";
  }

  return { riskLabel, fearLine, reply: { bad, goodFirst, goodRest, bestMove, internalAction } };
}

// ── Component ──────────────────────────────────────────────────────

export default function App() {
  const [message, setMessage] = useState("");
  const [authority, setAuthority] = useState<Authority>("can_refund");
  const [result, setResult] = useState<DefuseResult | null>(null);
  const [usesLeft, setUsesLeft] = useState(3);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("defuse_uses_v5");
    if (stored !== null) setUsesLeft(parseInt(stored, 10));

    // Restore unlock from a previously verified license
    const existingLicense = loadLicense();
    if (existingLicense) {
      setIsUnlocked(true);
      return;
    }

    // Listen for a fresh Gumroad purchase in this session
    const off = onGumroadPurchase(async (data: GumroadPurchaseEvent) => {
      const valid = await verifyLicense(data.license_key);
      if (valid) {
        saveLicense(data.license_key);
        setIsUnlocked(true);
        setShowPaywall(false);
      }
    });

    return off;
  }, []);

  const decrementUses = useCallback(() => {
    setUsesLeft((prev) => {
      const next = Math.max(0, prev - 1);
      localStorage.setItem("defuse_uses_v5", String(next));
      return next;
    });
  }, []);

  const handleDefuse = async () => {
    if (!message.trim()) return;
    if (usesLeft <= 0 && !isUnlocked) {
      setShowPaywall(true);
      return;
    }

    setIsLoading(true);
    setResult(null);
    await new Promise((r) => setTimeout(r, 1200));

    const output = buildReply(message, authority);
    setResult(output);
    if (!isUnlocked) decrementUses();
    setIsLoading(false);
  };

  const handleUnlock = () => {
    // Open the Gumroad overlay checkout.
    // gumroad.js (loaded in index.html) intercepts clicks on anchors
    // pointing to gumroad.com and opens them as an in-app overlay.
    const anchor = document.createElement("a");
    anchor.href = GUMROAD_PRODUCT_URL;
    anchor.className = "gumroad-button";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Post-payment unlock is handled by the gumroad:purchase listener in useEffect.
  };

  const handleCopy = () => {
    if (!result) return;
    const full = result.reply.goodFirst + " " + result.reply.goodRest;
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setMessage("");
    setResult(null);
    setCopied(false);
  };

  const isNoUses = usesLeft <= 0 && !isUnlocked;
  const isLocked = result && !isUnlocked;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white font-sans selection:bg-orange-500/20">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0b]/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight">Defuse</span>
          </div>
          <div className="flex items-center gap-3">
            {!isUnlocked && (
              <Badge
                variant="outline"
                className={`border-white/10 text-xs ${usesLeft === 1 ? "text-orange-400 border-orange-500/30" : "text-white/50"}`}
              >
                {usesLeft} free {usesLeft === 1 ? "use" : "uses"} left
              </Badge>
            )}
            {isUnlocked && (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                Unlocked
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        {/* ── HERO ──────────────────────────────────────────────── */}
        <div className="text-center space-y-3">
          <h1 className="text-[1.75rem] sm:text-[2.25rem] font-black tracking-tight leading-[1.15]">
            You're one reply away from{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">
              losing this customer
            </span>
            .
          </h1>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            Paste the message. Get the exact reply that keeps them.
          </p>
        </div>

        {/* ── BEFORE / AFTER (CENTERPIECE) ─────────────────────── */}
        {!result && (
          <div className="rounded-2xl border border-white/[0.08] overflow-hidden bg-[#0f0f10]">
            <div className="bg-red-500/[0.07] border-b border-red-500/[0.12] px-5 py-3.5">
              <div className="text-[11px] font-bold text-red-400/80 uppercase tracking-widest mb-1.5">
                Angry customer message
              </div>
              <p className="text-sm text-white/90 font-medium italic">
                "This is a scam I want a refund right now or I'm calling my bank"
              </p>
            </div>

            <div className="p-5 space-y-5">
              {/* BAD */}
              <div className="relative pl-4">
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500/40 rounded-full" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center">
                      <X className="w-3 h-3 text-red-400" />
                    </div>
                    <span className="text-[11px] font-bold text-red-400/90 uppercase tracking-wider">
                      What most people say — loses the customer
                    </span>
                  </div>
                  <p className="text-sm text-white/30 line-through decoration-red-500/30 leading-relaxed">
                    We apologize. Our team will investigate and respond within 3–5 business days.
                  </p>
                </div>
              </div>

              {/* ARROW */}
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-white/30 rotate-90" />
                </div>
              </div>

              {/* GOOD */}
              <div className="relative pl-4">
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500/50 rounded-full" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      What actually saves the sale
                    </span>
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed font-medium">
                    That's on us — completely. I'm processing a full refund right now. No questions. You'll see it in 24 hours. I'll message you personally in 2 days to make sure this never happens again.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── WARNING BANNER ────────────────────────────────────── */}
        {usesLeft === 1 && !isUnlocked && (
          <div className="bg-orange-500/[0.08] border border-orange-500/20 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-orange-400">⚠️ 1 free use left</p>
              <p className="text-xs text-orange-400/60">
                After this, the reply that saves them is locked
              </p>
            </div>
            <Button
              size="sm"
              className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 text-xs font-bold shrink-0 h-8"
              onClick={() => setShowPaywall(true)}
            >
              Get
            </Button>
          </div>
        )}

        {isNoUses && (
          <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl p-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-base font-bold">You've used all 3 free uses</p>
            <p className="text-sm text-white/40">The exact reply that saves this customer is locked</p>
            <Button
              className="bg-white text-black hover:bg-white/90 font-bold text-sm px-6 h-10"
              onClick={() => setShowPaywall(true)}
            >
              Fix this before they chargeback — $9
            </Button>
          </div>
        )}

        {/* ── AUTHORITY SELECTOR ────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">
            What's your refund authority?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.entries(AUTHORITY_TITLES) as [Authority, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setAuthority(key);
                  if (result) setResult(buildReply(message, key));
                }}
                className={`relative px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all ${
                  authority === key
                    ? "border-orange-500/40 bg-orange-500/[0.08] text-white shadow-sm shadow-orange-500/10"
                    : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:text-white/70 hover:border-white/10"
                }`}
              >
                {authority === key && (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-orange-400" />
                )}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── INPUT ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <label className="text-sm font-bold text-white/70 block">
            Paste the angry message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={'e.g. "This is a scam I want a refund right now"'}
            disabled={isNoUses}
            className="w-full min-h-[110px] bg-[#111] border border-white/[0.08] rounded-xl p-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/30 focus:ring-1 focus:ring-orange-500/10 resize-none transition-all leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/25">
              {message.length > 0 ? `${message.length} chars` : "Real messages work best"}
            </div>
            <div className="flex gap-2 items-center">
              {result && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-white/40 hover:text-white hover:bg-white/5 text-xs h-9"
                  onClick={handleReset}
                >
                  New message
                </Button>
              )}
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  onClick={handleDefuse}
                  disabled={!message.trim() || isLoading || isNoUses}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold text-sm px-5 h-9 shadow-lg shadow-orange-500/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Reading...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Defuse this
                    </span>
                  )}
                </Button>
                {!result && (
                  <span className="text-[10px] text-white/25">Takes 8 seconds</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RESULTS ────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-4">
            {/* Risk Banner */}
            <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
                  {result.riskLabel}
                </span>
              </div>
              <p className="text-sm text-white/70 mt-1">
                <span className="text-red-400 font-semibold">⚠️ {result.fearLine}</span>
              </p>
            </div>

            {/* Bad Reply */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-red-400/80 uppercase tracking-wider flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" />
                What most people reply — loses them
              </div>
              <div className="bg-red-500/[0.04] border border-red-500/[0.12] rounded-xl p-4">
                <p className="text-sm text-white/35 line-through decoration-red-500/25 leading-relaxed">
                  {result.reply.bad}
                </p>
              </div>
            </div>

            {/* Good Reply */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-emerald-400/80 uppercase tracking-wider flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                The reply that saves this customer
                {isLocked && (
                  <Lock className="w-3.5 h-3.5 text-orange-400 ml-auto" />
                )}
              </div>

              {isLocked ? (
                <div className="bg-emerald-500/[0.06] border border-emerald-500/[0.15] rounded-xl overflow-hidden">
                  {/* First line — CLEARLY VISIBLE (proves value before lock) */}
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-sm text-white/90 leading-relaxed font-medium">
                      {result.reply.goodFirst}
                    </p>
                  </div>
                  {/* Divider showing "solution starts here" */}
                  <div className="px-4">
                    <div className="h-px bg-emerald-500/20 w-full" />
                  </div>
                  {/* Rest — BLURRED with lock overlay */}
                  <div className="relative px-4 pt-2 pb-4">
                    <div className="blur-[5px] select-none">
                      <p className="text-sm text-white/60 leading-relaxed">
                        {result.reply.goodRest}
                      </p>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#0a0a0b]/40 rounded-lg backdrop-blur-[1px] px-4">
                      <div className="text-center space-y-1">
                        <p className="text-[10px] text-white/30 uppercase tracking-wider">
                          Used by support teams to prevent refunds in real conversations
                        </p>
                        <p className="text-sm font-black text-white leading-snug pt-1">
                          If you send the wrong reply, this customer is gone.
                        </p>
                        <p className="text-xs text-white/50">
                          You won't get a second chance.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-white text-black hover:bg-white/90 font-bold text-xs px-4 h-8"
                        onClick={() => setShowPaywall(true)}
                      >
                        Fix this before they chargeback — $9
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </Button>
                      <p className="text-[10px] text-white/25">
                        Losing this customer costs more than $9. Takes 8 seconds to send.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-500/[0.06] border border-emerald-500/[0.15] rounded-xl p-4 space-y-3">
                  <p className="text-sm text-white/90 leading-relaxed font-medium">
                    {result.reply.goodFirst} {result.reply.goodRest}
                  </p>
                  <Button
                    size="sm"
                    onClick={handleCopy}
                    className={`text-xs font-semibold h-8 ${
                      copied
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white"
                    }`}
                    variant="outline"
                  >
                    {copied ? (
                      <span className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Copied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Copy className="w-3.5 h-3.5" /> Copy reply
                      </span>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* ── PAID EXTRAS (unlocked only) ─────────────────────── */}
            {!isLocked && (
              <div className="space-y-3 pt-2">
                {/* Best Move */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                  <div className="text-[11px] font-bold text-orange-400/80 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    Best Move
                  </div>
                  <p className="text-sm text-white/80 font-medium">{result.reply.bestMove}</p>
                </div>

                {/* Internal Action */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                  <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5" />
                    Internal Action
                  </div>
                  <p className="text-sm text-white/80">{result.reply.internalAction}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MICRO PROOF ───────────────────────────────────────── */}
        <p className="text-center text-[11px] text-white/20 pt-4">
          Used by support teams to prevent refunds in real conversations
        </p>
      </main>

      {/* ── PAYWALL MODAL ───────────────────────────────────────── */}
      {showPaywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={() => setShowPaywall(false)} />
          <div className="relative bg-[#111] border border-white/[0.1] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16 bg-red-500/10 blur-3xl pointer-events-none" />

            <div className="p-7 space-y-5 relative">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center mx-auto border border-red-500/20">
                  <Lock className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="text-xl font-black leading-tight">
                  If you send the wrong reply, this customer is gone.
                </h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  You've used all 3 free uses. The exact words that save this sale are locked.
                </p>
              </div>

              <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
                {[
                  "Unlimited customer-saving replies",
                  "Best move strategy for every message",
                  "Internal action plans for your team",
                  "No more lost sales to bad replies",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                    <span className="text-sm font-medium text-white/80">{item}</span>
                  </div>
                ))}
              </div>

              <p className="text-center text-[11px] text-white/25">
                Used by support teams to prevent real customer chargebacks
              </p>

              <div className="space-y-2">
                <Button
                  className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold text-sm h-11 shadow-lg shadow-orange-500/20"
                  onClick={handleUnlock}
                >
                  Fix this before they chargeback — $9
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
                <p className="text-center text-[11px] text-white/20">
                  Losing this customer costs more than $9. Takes 8 seconds to send.
                </p>
                <button
                  onClick={() => setShowPaywall(false)}
                  className="w-full text-xs text-white/20 hover:text-white/40 transition-colors py-2"
                >
                  Close — but this customer is walking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
