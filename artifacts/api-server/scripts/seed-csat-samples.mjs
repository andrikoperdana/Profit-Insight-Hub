import { prisma } from "@workspace/db";
import { randomBytes } from "node:crypto";

function token() {
  return randomBytes(24).toString("base64url");
}

const SAMPLE_RESPONSES = [
  {
    submitterName: "Pak Budi Santoso",
    submitterEmail: "budi.santoso@banknusantara.co.id",
    answers: {
      project_management: { rating: 5 },
      consultant_performance: { rating: 5 },
      report_quality: { rating: 4 },
      team_overall: { rating: 5 },
      lesson_learned: { text: "Tim sangat profesional dan komunikasi rutin setiap minggu sangat membantu kami memahami progres." },
    },
    lessonLearned: "Tim sangat profesional dan komunikasi rutin setiap minggu sangat membantu kami memahami progres.",
  },
  {
    submitterName: "Ibu Rina Wijaya",
    submitterEmail: "rina.wijaya@teleselaras.id",
    answers: {
      project_management: { rating: 4 },
      consultant_performance: { rating: 5 },
      report_quality: { rating: 5 },
      team_overall: { rating: 4 },
      lesson_learned: { text: "Laporan akhir sangat detail. Saran: jadwal kick-off bisa dipercepat 1 minggu untuk proyek selanjutnya." },
    },
    lessonLearned: "Laporan akhir sangat detail. Saran: jadwal kick-off bisa dipercepat 1 minggu untuk proyek selanjutnya.",
  },
  {
    submitterName: "Pak Andi Pratama",
    submitterEmail: "andi.pratama@energiprima.co.id",
    answers: {
      project_management: { rating: 4 },
      consultant_performance: { rating: 4 },
      report_quality: { rating: 4 },
      team_overall: { rating: 4 },
      lesson_learned: { text: "Hasil pengujian penetrasi sesuai harapan. Mohon disertakan executive summary yang lebih ringkas." },
    },
    lessonLearned: "Hasil pengujian penetrasi sesuai harapan. Mohon disertakan executive summary yang lebih ringkas.",
  },
  {
    submitterName: "Ibu Sari Mulyani",
    submitterEmail: null,
    answers: {
      project_management: { rating: 5 },
      consultant_performance: { rating: 5 },
      report_quality: { rating: 5 },
      team_overall: { rating: 5 },
      lesson_learned: { text: "Sangat puas. Konsultan sangat responsif terhadap pertanyaan teknis kami." },
    },
    lessonLearned: "Sangat puas. Konsultan sangat responsif terhadap pertanyaan teknis kami.",
  },
  {
    submitterName: null,
    submitterEmail: null,
    answers: {
      project_management: { rating: 3 },
      consultant_performance: { rating: 4 },
      report_quality: { rating: 4 },
      team_overall: { rating: 4 },
      lesson_learned: { text: "Secara umum baik. Saran agar dokumentasi konfigurasi disertakan langsung saat handover." },
    },
    lessonLearned: "Secara umum baik. Saran agar dokumentasi konfigurasi disertakan langsung saat handover.",
  },
  {
    submitterName: "Pak Reza Hakim",
    submitterEmail: "reza@retailmaju.co.id",
    answers: {
      project_management: { rating: 5 },
      consultant_performance: { rating: 4 },
      report_quality: { rating: 5 },
      team_overall: { rating: 5 },
      lesson_learned: { text: "Pelaksanaan rapi, hasil rekomendasi sangat actionable. Terima kasih!" },
    },
    lessonLearned: "Pelaksanaan rapi, hasil rekomendasi sangat actionable. Terima kasih!",
  },
];

async function main() {
  console.log("Seeding CSAT sample data…");

  // 1. Make sure default questions exist
  const existing = await prisma.surveyQuestion.count();
  if (existing === 0) {
    await prisma.surveyQuestion.createMany({
      data: [
        { key: "project_management", text: "How would you rate our project management?", type: "RATING", order: 1, required: true, isActive: true },
        { key: "consultant_performance", text: "How would you rate our consultant performance?", type: "RATING", order: 2, required: true, isActive: true },
        { key: "report_quality", text: "How would you rate the quality of our final report?", type: "RATING", order: 3, required: true, isActive: true },
        { key: "team_overall", text: "How would you rate the team overall?", type: "RATING", order: 4, required: true, isActive: true },
        { key: "lesson_learned", text: "What could we have done better?", type: "TEXT", order: 5, required: false, isActive: true },
      ],
    });
    console.log("  • Inserted default survey questions");
  }

  // 2. Find candidate projects: at least 3 we will close + survey
  const candidates = await prisma.project.findMany({
    where: { status: { in: ["COMPLETE", "ACTIVE", "PAUSE", "OBSERVATION", "CLOSED"] } },
    take: 6,
    orderBy: { createdAt: "asc" },
    include: { client: true },
  });

  if (candidates.length === 0) {
    console.log("  ! No projects found. Run the main seed first.");
    return;
  }

  const questions = await prisma.surveyQuestion.findMany({ where: { isActive: true } });
  const snapshot = questions.map((q) => ({
    key: q.key,
    text: q.text,
    type: q.type,
    order: q.order,
    required: q.required,
  }));

  const now = new Date();
  // Spread responses across the current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let respIdx = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const project = candidates[i];

    // Promote to CLOSED + ensure token
    let surveyToken = project.surveyToken;
    if (project.status !== "CLOSED" || !surveyToken) {
      surveyToken = surveyToken ?? token();
      await prisma.project.update({
        where: { id: project.id },
        data: { status: "CLOSED", surveyToken },
      });
      console.log(`  • Closed project ${project.code} — ${project.client.name}`);
    }

    // Add 1-2 responses per project, dated within current month
    const count = i < 3 ? 2 : 1;
    for (let k = 0; k < count; k += 1) {
      const tpl = SAMPLE_RESPONSES[respIdx % SAMPLE_RESPONSES.length];
      respIdx += 1;
      const dayOffset = Math.floor(((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) * Math.random());
      const createdAt = new Date(monthStart.getTime() + dayOffset * 24 * 60 * 60 * 1000 + respIdx * 3600_000);
      await prisma.surveyResponse.create({
        data: {
          projectId: project.id,
          submitterName: tpl.submitterName,
          submitterEmail: tpl.submitterEmail,
          lessonLearned: tpl.lessonLearned,
          answers: tpl.answers,
          questionsSnapshot: snapshot,
          createdAt,
        },
      });
    }
    console.log(`    → ${count} response(s) added for ${project.code}`);
  }

  const total = await prisma.surveyResponse.count();
  console.log(`Done. Total survey responses in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
