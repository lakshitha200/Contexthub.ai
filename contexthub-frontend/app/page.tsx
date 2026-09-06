import {
  ArrowRight,
  Binary,
  Boxes,
  FileSearch,
  FileText,
  Layers,
  Lock,
  MessagesSquare,
  Mic,
  Quote,
  ScanLine,
  Search,
  Sparkles,
  Table2,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { BetaBadge, Logo } from "@/components/brand";
import { AnswerPreview } from "@/components/marketing/answer-preview";
import { Faq } from "@/components/marketing/faq";
import { Reveal, RevealGroup, RevealItem } from "@/components/marketing/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/*                                                                     */
/*  Every claim below maps to something the backend actually does.     */
/*  Nothing here is aspirational, which is the only way a landing page  */
/*  survives contact with the product.                                 */
/* ------------------------------------------------------------------ */

const FILE_TYPES = [
  { icon: FileText, label: "PDF" },
  { icon: FileText, label: "Word" },
  { icon: Table2, label: "CSV" },
  { icon: Binary, label: "JSON" },
  { icon: FileText, label: "Markdown" },
  { icon: ScanLine, label: "Scans" },
  { icon: Layers, label: "Images" },
];

const FEATURES = [
  {
    icon: Quote,
    title: "Every claim is cited",
    body: "Answers come with the document, page and passage behind them. If ContextHub cannot find support in your files, it says so instead of inventing one.",
  },
  {
    icon: ScanLine,
    title: "Reads more than plain text",
    body: "Tables stay whole, charts and diagrams are described in words, and scanned pages are read with vision. A PDF that is really photos of paper still becomes searchable.",
  },
  {
    icon: FileSearch,
    title: "Knows what each file is",
    body: "On upload, every document gets a summary, a type and its topics. You see at a glance what is in a file, and retrieval gets sharper because each passage carries that context.",
  },
  {
    icon: Search,
    title: "Search by meaning, not keywords",
    body: "Questions are matched against the meaning of your documents, so the right passage surfaces even when it shares none of your wording.",
  },
  {
    icon: MessagesSquare,
    title: "Follow-ups that actually land",
    body: "Ask “what about the year before?” and it knows what you meant. Your question is rewritten with the conversation in mind before anything is searched.",
  },
  {
    icon: Mic,
    title: "Ask out loud, listen back",
    body: "Speak your question instead of typing it, and have any answer read back to you. Useful when your hands are busy and your reading is not.",
  },
];

const STEPS = [
  {
    icon: Upload,
    step: "01",
    title: "Upload your documents",
    body: "Drop files into a collection. Reports, contracts, research, meeting notes, spreadsheets, whatever your team already wrote down.",
  },
  {
    icon: Boxes,
    step: "02",
    title: "ContextHub reads them",
    body: "Each file is parsed, split into passages, summarised and indexed. Charts and scans go through vision on the way. It happens in the background while you keep working.",
  },
  {
    icon: Sparkles,
    step: "03",
    title: "Ask anything",
    body: "Ask in plain language. ContextHub finds the passages that matter, answers from those, and shows you exactly where each part came from.",
  },
];

const PIPELINE = [
  { title: "Parse", body: "Text, tables and images are pulled out of the file, with vision handling anything the text layer cannot." },
  { title: "Chunk", body: "Content is split on natural boundaries with overlap, and tables are kept intact so they stay readable on their own." },
  { title: "Embed", body: "Each passage becomes a vector, prefixed with its document summary so it never loses the context it came from." },
  { title: "Retrieve", body: "Your question is embedded too, then matched against the index to pull back only the passages that relate to it." },
  { title: "Answer", body: "Those passages, and nothing else, are handed to the model to write a grounded answer with its citations attached." },
];

const TRUST = [
  {
    icon: Lock,
    title: "Workspace isolation",
    body: "Every query is scoped to one workspace in the database itself, so a document can never leak into another team's answers.",
  },
  {
    icon: Users,
    title: "Roles that mean something",
    body: "Owners, admins and members have different powers over documents, invitations and settings. Invites expire and can be revoked.",
  },
  {
    icon: MessagesSquare,
    title: "Private conversations",
    body: "Your chats belong to you, even inside a workspace you share. Teammates see the documents, not your questions.",
  },
];

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main>
        {/* ---------------------------------------------------------- */}
        {/*  Hero                                                       */}
        {/* ---------------------------------------------------------- */}
        <section className="bg-aurora relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-grid opacity-[0.35]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-5 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
            <Reveal>
              {/* Solid, not frosted. This chip scrolls, and a backdrop-filter
                  on a moving element re-blurs its backdrop every frame for a
                  effect that is invisible against a soft gradient anyway. */}
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-soft">
                <BetaBadge />
                <span className="text-muted-foreground">Open to everyone while we build</span>
              </span>

              <h1 className="mt-6 text-[1.95rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl sm:leading-[1.06] lg:text-6xl">
                Ask your documents.{" "}
                {/* Forced break only once there is room for it. On a narrow
                    phone "Ask your documents." already fills the line, and a
                    hard break there leaves a lonely orphan word. */}
                <br className="hidden sm:block" />
                Get answers you can <span className="text-gradient">check</span>.
              </h1>

              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground sm:text-lg">
                ContextHub reads everything your team has written down, then
                answers questions from it with a citation on every claim.
                Tables, charts and scanned pages included.
              </p>

              <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Link href="/auth/register">
                  <Button size="lg" className="group relative overflow-hidden">
                    <span className="sheen absolute inset-0" />
                    Start for free
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <a href="#how">
                  <Button size="lg" variant="outline">
                    See how it works
                  </Button>
                </a>
              </div>

              <p className="mt-5 text-sm text-muted-foreground">
                Free while in beta. No credit card needed.
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <AnswerPreview />
            </Reveal>
          </div>

          {/* What it can read. A concrete list beats an adjective. */}
          <div className="border-y border-border/70 bg-card/50">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-3 px-4 py-5 sm:gap-x-8 sm:px-5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reads
              </span>
              {FILE_TYPES.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Features                                                   */}
        {/* ---------------------------------------------------------- */}
        <section id="features" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-5">
            <Reveal>
              <SectionHeading
                eyebrow="Features"
                title={
                  <>
                    Built to be trusted, not just{" "}
                    <span className="text-gradient">impressive</span>
                  </>
                }
                body="A confident wrong answer is worse than no answer. Everything here exists to make the answer checkable."
              />
            </Reveal>

            <RevealGroup className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <RevealItem key={title}>
                  <div className="hover-lift group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft">
                    <span className="absolute inset-x-0 top-0 h-px bg-gradient-brand opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <span className="sheen absolute inset-0" />
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground transition-transform duration-300 group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  How it works                                               */}
        {/* ---------------------------------------------------------- */}
        <section id="how" className="scroll-mt-20 border-y border-border bg-sidebar py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-5">
            <Reveal>
              <SectionHeading
                eyebrow="How it works"
                title="Three steps, then it just answers"
                body="Setup is uploading files. There is no schema to design, no tagging to keep up with, and nothing to maintain."
              />
            </Reveal>

            <RevealGroup className="relative mt-14 grid gap-6 md:grid-cols-3" stagger={0.12}>
              {STEPS.map(({ icon: Icon, step, title, body }, i) => (
                <RevealItem key={step} className="relative">
                  {/* Connector between steps on wide screens. */}
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute right-[-1.1rem] top-11 hidden h-px w-[2.2rem] bg-gradient-to-r from-border to-transparent md:block"
                    />
                  )}
                  <div className="hover-lift h-full rounded-2xl border border-border bg-card p-6 shadow-soft">
                    <div className="flex items-center justify-between">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-brand text-white shadow-soft">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-3xl font-bold tracking-tight text-border">{step}</span>
                    </div>
                    <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Under the hood                                             */}
        {/* ---------------------------------------------------------- */}
        <section id="pipeline" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-5">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <Reveal>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Under the hood
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  What happens between{" "}
                  <span className="text-gradient">upload and answer</span>
                </h2>
                <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
                  No magic, just a pipeline you can reason about. Each stage is
                  visible in the app, so when a document is still processing you
                  know exactly which step it is on.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <span className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                    Vector search
                  </span>
                  <span className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                    Vision extraction
                  </span>
                  <span className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                    Contextual retrieval
                  </span>
                  <span className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                    Streamed answers
                  </span>
                </div>
              </Reveal>

              <RevealGroup className="space-y-3" stagger={0.08}>
                {PIPELINE.map(({ title, body }, i) => (
                  <RevealItem key={title}>
                    <div className="hover-lift flex gap-4 rounded-xl border border-border bg-card p-4 shadow-soft">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">
                        {i + 1}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold">{title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                      </div>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Privacy and teams                                          */}
        {/* ---------------------------------------------------------- */}
        <section className="border-y border-border bg-sidebar py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-5">
            <Reveal>
              <SectionHeading
                eyebrow="Teams and privacy"
                title="Separate by default"
                body="Knowledge is only useful when people trust where it goes. Isolation is enforced in the data layer, not by convention."
              />
            </Reveal>

            <RevealGroup className="mt-14 grid gap-5 md:grid-cols-3">
              {TRUST.map(({ icon: Icon, title, body }) => (
                <RevealItem key={title}>
                  <div className="hover-lift h-full rounded-2xl border border-border bg-card p-6 shadow-soft">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  FAQ                                                        */}
        {/* ---------------------------------------------------------- */}
        <section id="faq" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-5">
            <Reveal>
              <SectionHeading eyebrow="FAQ" title="Questions worth asking first" />
            </Reveal>
            <Reveal delay={0.1} className="mt-12">
              <Faq />
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Closing call to action                                     */}
        {/* ---------------------------------------------------------- */}
        <section className="px-4 pb-16 sm:px-5 sm:pb-24">
          <Reveal className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-brand px-6 py-14 text-center text-white shadow-pop sm:px-16 sm:py-16">
              <div className="absolute inset-0 bg-grid opacity-20 mix-blend-overlay" />
              <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
              <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-black/15 blur-3xl" />

              <div className="relative">
                <div className="mb-6 flex justify-center">
                  <Logo size={56} />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Put your team&apos;s knowledge to work
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-white/80">
                  Create a workspace, upload a document, and ask it something.
                  It takes about two minutes to find out whether this is useful
                  to you.
                </p>
                <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
                  <Link href="/auth/register">
                    <Button
                      size="lg"
                      className="group bg-white text-[color:var(--primary)] shadow-soft hover:bg-white hover:brightness-100"
                    >
                      Create your workspace
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                  <Link href="/auth/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="border-white/35 bg-white/15 text-white hover:bg-white/25"
                    >
                      I already have an account
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
