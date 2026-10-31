import fs from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { fmtDate } from "@/lib/format";
import { fmtRate, type ReportModel } from "./build";

const C = {
  indigo: "#4f46e5",
  indigoDark: "#312e81",
  indigoLight: "#eef0ff",
  band: "#f8f8fd",
  ink: "#1b2941",
  muted: "#68758a",
  border: "#e3e6f0",
  goodBg: "#d1fae5",
  goodInk: "#047857",
  midBg: "#fef3c7",
  midInk: "#b45309",
  lowBg: "#fee2e2",
  lowInk: "#b91c1c",
};

/**
 * Les polices PDF standard (Helvetica) ne couvrent que le jeu WinAnsi :
 * on retire les caractères hors jeu (emojis…) pour éviter des glyphes illisibles.
 */
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const t = (s: string | number | null | undefined) =>
  Array.from(String(s ?? ""))
    .filter((ch) => {
      const c = ch.codePointAt(0)!;
      return c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.includes(ch);
    })
    .join("");

// Contenu du fichier (un chemin Windows « C:\… » serait pris pour une URL)
const LOGO = { data: fs.readFileSync(path.join(process.cwd(), "public", "logo.png")), format: "png" as const };

// Pas de coupure de mots (« Modifi-able ») : un mot trop long passe simplement à la ligne
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { paddingTop: 70, paddingBottom: 50, paddingHorizontal: 36, fontSize: 9, color: C.ink, fontFamily: "Helvetica" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, height: 44, backgroundColor: C.indigo, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 36 },
  topBrand: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 10 },
  topTitle: { color: "#c7d2fe", fontSize: 8.5 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 6 },
  hero: { backgroundColor: C.indigoDark, borderRadius: 8, padding: 18, marginBottom: 16 },
  heroKicker: { color: "#a5b4fc", fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, marginBottom: 6 },
  heroTitle: { color: "#fff", fontSize: 20, fontFamily: "Helvetica-Bold" },
  heroSub: { color: "#e0e7ff", fontSize: 10, marginTop: 6 },
  chips: { flexDirection: "row", gap: 6, marginTop: 10 },
  chip: { backgroundColor: "#4338ca", color: "#fff", fontSize: 8, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10 },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 16 },
  kpi: { flex: 1, backgroundColor: C.indigoLight, borderRadius: 6, padding: 10, borderLeftWidth: 3, borderLeftColor: C.indigo },
  kpiLabel: { fontSize: 7.5, color: C.muted, fontFamily: "Helvetica-Bold" },
  kpiValue: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.indigo, marginTop: 3 },
  kpiHint: { fontSize: 7, color: C.muted, marginTop: 2 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.indigo, marginTop: 14, marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1.5, borderBottomColor: C.indigo },
  th: { flexDirection: "row", backgroundColor: C.indigo, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  thCell: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 7.5, paddingVertical: 5, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.border },
  td: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 8 },
  groupBar: { flexDirection: "row", justifyContent: "space-between", backgroundColor: C.indigoLight, paddingVertical: 4, paddingHorizontal: 6, marginTop: 6, borderLeftWidth: 3, borderLeftColor: C.indigo },
  groupBarText: { fontFamily: "Helvetica-Bold", color: C.indigoDark, fontSize: 8.5 },
  pill: { borderRadius: 8, paddingVertical: 1.5, paddingHorizontal: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, textAlign: "center" },
  muted: { color: C.muted },
  empty: { color: C.muted, fontStyle: "italic", paddingVertical: 6 },
  chartRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  chartLabel: { width: 90, fontSize: 7.5 },
  chartTrack: { flex: 1, height: 9, backgroundColor: C.indigoLight, borderRadius: 3 },
  chartValue: { width: 50, fontSize: 7.5, textAlign: "right", fontFamily: "Helvetica-Bold" },
  summaryCard: { borderWidth: 0.5, borderColor: C.border, borderRadius: 6, padding: 8, marginBottom: 6 },
});

function Rate({ rate }: { rate: number | null }) {
  if (rate == null) return <Text style={s.muted}>—</Text>;
  const [bg, ink] = rate >= 0.75 ? [C.goodBg, C.goodInk] : rate >= 0.5 ? [C.midBg, C.midInk] : [C.lowBg, C.lowInk];
  return <Text style={[s.pill, { backgroundColor: bg, color: ink }]}>{fmtRate(rate)}</Text>;
}

type Col<T> = { label: string; width: number | string; align?: "left" | "center" | "right"; render: (row: T) => React.ReactNode };

function Table<T>({ cols, rows, empty = "Aucune donnée." }: { cols: Col<T>[]; rows: T[]; empty?: string }) {
  return (
    <View>
      <View style={s.th} wrap={false}>
        {cols.map((c) => (
          <Text key={c.label} style={[s.thCell, { width: c.width, textAlign: c.align ?? "left" }]}>
            {t(c.label)}
          </Text>
        ))}
      </View>
      {rows.length === 0 && <Text style={s.empty}>{t(empty)}</Text>}
      {rows.map((r, i) => (
        <View key={i} style={[s.tr, i % 2 ? { backgroundColor: C.band } : {}]} wrap={false}>
          {cols.map((c) => {
            const v = c.render(r);
            return (
              <View key={c.label} style={[s.td, { width: c.width, alignItems: c.align === "center" ? "center" : c.align === "right" ? "flex-end" : "flex-start" }]}>
                {typeof v === "string" || typeof v === "number" ? <Text>{t(v)}</Text> : v}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Barres horizontales à une seule teinte ; la valeur est toujours écrite. */
function Bars({ items }: { items: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={{ marginBottom: 6 }}>
      {items.map((i) => (
        <View key={i.label} style={s.chartRow} wrap={false}>
          <Text style={s.chartLabel}>{t(i.label)}</Text>
          <View style={s.chartTrack}>
            <View style={{ width: `${(i.value / max) * 100}%`, height: 9, backgroundColor: C.indigo, borderRadius: 3 }} />
          </View>
          <Text style={s.chartValue}>{t(i.text)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Texte multiligne : une ligne = un bloc (les lignes vides deviennent un petit espace). */
function Paragraphs({ text }: { text: string }) {
  return (
    <View>
      {text.split("\n").map((line, i) =>
        line ? (
          <Text key={i} style={{ lineHeight: "12pt" }}>
            {t(line)}
          </Text>
        ) : (
          <View key={i} style={{ height: 5 }} />
        )
      )}
    </View>
  );
}

function Hero({ m, kicker }: { m: ReportModel; kicker: string }) {
  return (
    <View style={s.hero}>
      <Text style={s.heroKicker}>{t(kicker)}</Text>
      <Text style={s.heroTitle}>{t(m.title)}</Text>
      <Text style={s.heroSub}>{t(m.subtitle)}</Text>
      <View style={s.chips}>
        <Text style={s.chip}>{t(m.scope)}</Text>
        <Text style={s.chip}>{t(`Généré le ${m.generatedAt}`)}</Text>
        <Text style={s.chip}>{t(`Par ${m.generatedBy}`)}</Text>
      </View>
    </View>
  );
}

function Kpis({ m }: { m: ReportModel }) {
  return (
    <View style={s.kpis}>
      {m.kpis.map((k) => (
        <View key={k.label} style={s.kpi}>
          <Text style={s.kpiLabel}>{t(k.label.toUpperCase())}</Text>
          <Text style={[s.kpiValue, k.value.length > 7 ? { fontSize: 12, marginTop: 6 } : {}]}>{t(k.value)}</Text>
          {k.hint && <Text style={s.kpiHint}>{t(k.hint)}</Text>}
        </View>
      ))}
    </View>
  );
}

function Shell({ m, children }: { m: ReportModel; children: React.ReactNode }) {
  return (
    <Document title={t(m.title)} author={t(m.generatedBy)} creator="Famille ASD — Faiseurs de disciples" language="fr">
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* Logo rond (le PNG carré est découpé par le rayon de bordure) */}
            <Image src={LOGO} style={{ width: 28, height: 28, borderRadius: 14 }} />
            <Text style={s.topBrand}>Famille ASD · Faiseurs de disciples</Text>
          </View>
          <Text style={s.topTitle}>{t(m.title)}</Text>
        </View>
        {children}
        <View style={s.footer} fixed>
          <Text>{t(`${m.subtitle} · ${m.scope}`)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function PeriodReport({ m }: { m: ReportModel }) {
  const withSummary = m.events.filter((e) => e.summary);

  return (
    <Shell m={m}>
      <Hero m={m} kicker={m.kind === "mensuel" ? "RAPPORT MENSUEL" : "RAPPORT PAR PÉRIODE"} />
      <Kpis m={m} />

      <Text style={s.h2}>Activité par groupe</Text>
      <Table
        rows={m.byGroup}
        cols={[
          { label: "Groupe", width: "20%", render: (g) => <Text style={{ fontFamily: "Helvetica-Bold" }}>{t(g.group)}</Text> },
          { label: "Berger", width: "18%", render: (g) => g.shepherd },
          { label: "Membres", width: "9%", align: "center", render: (g) => g.members },
          { label: "Évén.", width: "8%", align: "center", render: (g) => g.events },
          { label: "Présences", width: "12%", align: "center", render: (g) => `${g.present}/${g.expected}` },
          { label: "Taux", width: "10%", align: "center", render: (g) => <Rate rate={g.rate} /> },
          { label: "Prières (exaucées)", width: "13%", align: "center", render: (g) => `${g.prayers} (${g.answered})` },
          { label: "Témoign.", width: "10%", align: "center", render: (g) => g.testimonies },
        ]}
      />

      {m.byMonth.length > 1 && (
        <View wrap={false}>
          <Text style={s.h2}>Événements par mois</Text>
          <Bars items={m.byMonth.map((mo) => ({ label: mo.label, value: mo.events, text: `${mo.events} · ${fmtRate(mo.rate)}` }))} />
          <Text style={[s.muted, { fontSize: 7 }]}>Nombre d’événements et taux de présence moyen du mois.</Text>
        </View>
      )}
      {m.byMonth.length > 0 && (
        <>
          <Text style={s.h2}>Synthèse mensuelle</Text>
          <Table
            rows={m.byMonth}
            cols={[
              { label: "Mois", width: "28%", render: (mo) => mo.label },
              { label: "Événements", width: "14%", align: "center", render: (mo) => mo.events },
              { label: "Taux de présence", width: "18%", align: "center", render: (mo) => <Rate rate={mo.rate} /> },
              { label: "Prières", width: "13%", align: "center", render: (mo) => mo.prayers },
              { label: "Exaucées", width: "13%", align: "center", render: (mo) => mo.answered },
              { label: "Témoignages", width: "14%", align: "center", render: (mo) => mo.testimonies },
            ]}
          />
        </>
      )}

      {withSummary.length > 0 && (
        <>
          <Text style={s.h2} break>
            Synthèses des événements
          </Text>
          {withSummary.map((e) => (
            <View key={e.id} style={s.summaryCard}>
              {/* Le titre reste avec le début du texte ; une synthèse longue peut continuer sur la page suivante */}
              <View wrap={false} minPresenceAhead={40}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>{t(e.title)}</Text>
                <Text style={[s.muted, { fontSize: 7.5, marginBottom: 4 }]}>
                  {t(`${fmtDate(e.date)} · ${e.time} · ${e.group}${e.theme ? ` · Thème : ${e.theme}` : ""}`)}
                </Text>
              </View>
              <Paragraphs text={e.summary} />
            </View>
          ))}
        </>
      )}

      <Text style={s.h2} break>
        Assiduité des membres
      </Text>
      <Table
        rows={m.members}
        empty="Aucun membre concerné sur la période."
        cols={[
          { label: "Membre", width: "34%", render: (mm) => mm.name },
          { label: "Groupe", width: "26%", render: (mm) => mm.group },
          { label: "Attendus", width: "13%", align: "center", render: (mm) => mm.expected },
          { label: "Présences", width: "13%", align: "center", render: (mm) => mm.present },
          { label: "Taux", width: "14%", align: "center", render: (mm) => <Rate rate={mm.rate} /> },
        ]}
      />

      <Text style={s.h2}>Sujets de prière</Text>
      <Table
        rows={m.prayers}
        empty="Aucun sujet de prière sur la période."
        cols={[
          { label: "Date", width: "12%", render: (p) => fmtDate(p.date) },
          { label: "Auteur", width: "15%", render: (p) => p.author },
          { label: "Groupe", width: "16%", render: (p) => p.group },
          { label: "Description", width: "43%", render: (p) => p.desc },
          {
            label: "Statut",
            width: "14%",
            align: "center",
            render: (p) => (
              <Text style={[s.pill, p.answered ? { backgroundColor: C.goodBg, color: C.goodInk } : { backgroundColor: C.midBg, color: C.midInk }]}>
                {p.answered ? "Exaucée" : "En attente"}
              </Text>
            ),
          },
        ]}
      />

      <Text style={s.h2}>Témoignages</Text>
      <Table
        rows={m.testimonies}
        empty="Aucun témoignage sur la période."
        cols={[
          { label: "Date", width: "12%", render: (x) => fmtDate(x.date) },
          { label: "Auteur", width: "15%", render: (x) => x.author },
          { label: "Groupe", width: "16%", render: (x) => x.group },
          { label: "Description", width: "43%", render: (x) => x.desc },
          { label: "Prière liée", width: "14%", align: "center", render: (x) => (x.linked ? "Oui" : "Non") },
        ]}
      />
    </Shell>
  );
}

function EventReportPdf({ m }: { m: ReportModel }) {
  const e = m.events[0];
  return (
    <Shell m={m}>
      <Hero m={m} kicker="RAPPORT D’ÉVÉNEMENT" />
      <Kpis m={m} />
      <Text style={s.h2}>Présences</Text>
      {(["present", "absent"] as const).map((tone) => {
        const list = e.attendees.filter((a) => a.present === (tone === "present"));
        const ok = tone === "present";
        return (
          <View key={tone} style={{ marginBottom: 10 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: ok ? "#059669" : "#dc2626", paddingVertical: 5, paddingHorizontal: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4 }}
              wrap={false}
              minPresenceAhead={30}
            >
              <Text style={{ color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 9.5 }}>{ok ? "Présents" : "Absents"}</Text>
              <Text style={{ color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 9.5 }}>{list.length}</Text>
            </View>
            {list.length === 0 && <Text style={[s.empty, { paddingHorizontal: 8 }]}>{ok ? "Aucun présent." : "Aucun absent."}</Text>}
            {list.map((a, i) => (
              <View key={a.personId} style={[s.tr, { backgroundColor: ok ? C.goodBg : C.lowBg }, i % 2 ? { opacity: 0.85 } : {}]} wrap={false}>
                <Text style={[s.td, { width: "8%", color: C.muted }]}>{i + 1}.</Text>
                <Text style={[s.td, { width: "52%" }]}>{t(a.name)}</Text>
                <Text style={[s.td, { width: "40%", color: C.muted }]}>{t(a.group)}</Text>
              </View>
            ))}
          </View>
        );
      })}
      <Text style={s.h2}>Synthèse de l’événement</Text>
      <View style={s.summaryCard}>
        <Paragraphs text={e.summary || "Aucune synthèse renseignée."} />
      </View>
    </Shell>
  );
}

export async function buildPdf(m: ReportModel): Promise<Buffer> {
  return renderToBuffer(m.kind === "evenement" ? <EventReportPdf m={m} /> : <PeriodReport m={m} />);
}
