import { prisma } from "./index.js";

type ReviewSeed = {
  subjectEmail: string;
  reviewerEmail: string;
  period: "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL";
  periodYear: number;
  status: "DRAFT" | "SUBMITTED" | "ACKNOWLEDGED";
  overallRating?: number;
  summary?: string;
  strengths?: string;
  improvements?: string;
  goals?: string;
  acknowledgement?: string;
  projectRatings?: { rating: number; comment: string }[];
};

function quarterRange(year: number, period: "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL") {
  if (period === "ANNUAL") {
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
  }
  const startMonth = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 }[period];
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 0, 23, 59, 59),
  };
}

export async function ensureSamplePerformanceReviews() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // Previous completed quarter
  const prevQIndex = Math.floor(month / 3) - 1;
  const prevQYear = prevQIndex < 0 ? year - 1 : year;
  const prevQ = (["Q1", "Q2", "Q3", "Q4"][(prevQIndex + 4) % 4]) as "Q1" | "Q2" | "Q3" | "Q4";
  // Current quarter
  const currQ = (["Q1", "Q2", "Q3", "Q4"][Math.floor(month / 3)]) as "Q1" | "Q2" | "Q3" | "Q4";

  const seeds: ReviewSeed[] = [
    {
      subjectEmail: "konsultan@itsecasia.com",
      reviewerEmail: "principal.kon.h7q4@itsecasia.com",
      period: prevQ,
      periodYear: prevQYear,
      status: "ACKNOWLEDGED",
      overallRating: 4,
      summary: "Strong technical delivery across multiple pentest engagements this quarter. Reliable contributor with consistent quality.",
      strengths: "Deep technical skill in web application and network pentesting. Mentors junior consultants effectively. High utilization without sacrificing report quality.",
      improvements: "Could improve proactive client communication during long engagements. Sometimes waits for PM to surface blockers instead of escalating directly.",
      goals: "Lead at least one full engagement end-to-end next quarter. Complete OSCP refresh and one cloud security certification (AWS or Azure).",
      acknowledgement: "Thanks for the feedback. Agree on the communication point — will set up weekly client touchpoints on long engagements.",
      projectRatings: [
        { rating: 5, comment: "Excellent technical depth. Findings were well-prioritized and reproducible." },
        { rating: 4, comment: "Good delivery, met all milestones. Minor delays on report draft." },
      ],
    },
    {
      subjectEmail: "konsultan2@itsecasia.com",
      reviewerEmail: "principal.kon.h7q4@itsecasia.com",
      period: prevQ,
      periodYear: prevQYear,
      status: "SUBMITTED",
      overallRating: 4,
      summary: "Solid quarter — Dewi handled GRC assessments with care and showed growth in client-facing work.",
      strengths: "Strong analytical thinking, attention to detail in control mapping. Builds rapport with client stakeholders.",
      improvements: "Should push more on technical depth — pair more often with senior pentest team on hybrid engagements.",
      goals: "Co-lead one hybrid GRC + technical assessment next quarter. Complete ISO 27001 LA training.",
      projectRatings: [
        { rating: 4, comment: "Strong on the GRC side, comprehensive control assessment." },
      ],
    },
    {
      subjectEmail: "writer@itsecasia.com",
      reviewerEmail: "principal.tw.m9k2@itsecasia.com",
      period: prevQ,
      periodYear: prevQYear,
      status: "ACKNOWLEDGED",
      overallRating: 5,
      summary: "Outstanding quarter for Ayu. Report quality has materially improved across the board.",
      strengths: "Excellent technical writing, fast turnaround, strong collaboration with consultants. Introduced new report templates that the team has adopted.",
      improvements: "Take on more review/QA of junior writers' output to scale impact.",
      goals: "Mentor at least one new technical writer joining next quarter. Standardize executive summary section across all report types.",
      acknowledgement: "Appreciate the recognition. Happy to take on QA responsibility — will draft a checklist for the team.",
      projectRatings: [
        { rating: 5, comment: "Reports delivered ahead of schedule with zero rework requested by client." },
      ],
    },
    {
      subjectEmail: "admin@itsecasia.com",
      reviewerEmail: "principal.ap.r3n8@itsecasia.com",
      period: prevQ,
      periodYear: prevQYear,
      status: "DRAFT",
      overallRating: 3,
      summary: "Reliable on administrative tasks but several closing-document delays this quarter affected billing cycles.",
      strengths: "Organized, dependable, good with document templates and invoice tracking.",
      improvements: "Need faster closing-doc turnaround (target: within 2 business days of project COMPLETE). Improve proactive follow-up with PM on BAST signatures.",
      goals: "Reduce average BAST-to-invoice lag from current ~5 days to under 3 days.",
    },
    {
      subjectEmail: "pm@itsecasia.com",
      reviewerEmail: "management@itsecasia.com",
      period: prevQ,
      periodYear: prevQYear,
      status: "ACKNOWLEDGED",
      overallRating: 4,
      summary: "Sari managed a heavy portfolio this quarter with solid margin discipline.",
      strengths: "Strong stakeholder management. Active in approving timesheets daily. Good margin oversight — flagged 2 at-risk projects early.",
      improvements: "Delegation could improve — tends to absorb tasks that admin project should handle. Resource planning sometimes reactive rather than forward-looking.",
      goals: "Maintain portfolio margin above 35%. Mentor pm2 (Yusuf) on margin recovery techniques.",
      acknowledgement: "Noted on delegation — will set up clearer admin-project ownership boundaries.",
      projectRatings: [
        { rating: 4, comment: "Well-managed engagement, kept margin healthy throughout." },
      ],
    },
    // Current quarter — DRAFTs to show in-flight reviews
    {
      subjectEmail: "konsultan@itsecasia.com",
      reviewerEmail: "principal.kon.h7q4@itsecasia.com",
      period: currQ,
      periodYear: year,
      status: "DRAFT",
    },
    {
      subjectEmail: "writer@itsecasia.com",
      reviewerEmail: "principal.tw.m9k2@itsecasia.com",
      period: currQ,
      periodYear: year,
      status: "DRAFT",
    },
  ];

  let created = 0;
  let skipped = 0;
  let ratingsCreated = 0;

  for (const seed of seeds) {
    const [subject, reviewer] = await Promise.all([
      prisma.user.findUnique({ where: { email: seed.subjectEmail } }),
      prisma.user.findUnique({ where: { email: seed.reviewerEmail } }),
    ]);
    if (!subject || !reviewer) { skipped++; continue; }

    const existing = await prisma.performanceReview.findUnique({
      where: { userId_period_periodYear: { userId: subject.id, period: seed.period, periodYear: seed.periodYear } },
    });
    if (existing) { skipped++; continue; }

    const { start, end } = quarterRange(seed.periodYear, seed.period);
    const submittedAt = seed.status === "DRAFT" ? null : new Date(end.getTime() + 3 * 86400_000);
    const acknowledgedAt = seed.status === "ACKNOWLEDGED" ? new Date(end.getTime() + 5 * 86400_000) : null;

    const review = await prisma.performanceReview.create({
      data: {
        userId: subject.id,
        reviewerId: reviewer.id,
        period: seed.period,
        periodYear: seed.periodYear,
        periodStart: start,
        periodEnd: end,
        status: seed.status,
        overallRating: seed.overallRating ?? null,
        summary: seed.summary ?? null,
        strengths: seed.strengths ?? null,
        improvements: seed.improvements ?? null,
        goals: seed.goals ?? null,
        acknowledgement: seed.acknowledgement ?? null,
        submittedAt,
        acknowledgedAt,
      },
    });
    created++;

    if (seed.projectRatings && seed.projectRatings.length > 0) {
      // Pick projects this user actually worked on in the period (approved timesheets first, then resource assignment)
      const tsProjects = await prisma.timesheet.findMany({
        where: {
          userId: subject.id,
          status: "APPROVED",
          workDate: { gte: start, lte: end },
        },
        select: { projectId: true },
        distinct: ["projectId"],
        take: seed.projectRatings.length,
      });
      let projectIds = tsProjects.map((t) => t.projectId);
      if (projectIds.length < seed.projectRatings.length) {
        const resources = await prisma.projectResource.findMany({
          where: { userId: subject.id, projectId: { notIn: projectIds } },
          select: { projectId: true },
          take: seed.projectRatings.length - projectIds.length,
        });
        projectIds = [...projectIds, ...resources.map((r) => r.projectId)];
      }
      for (let i = 0; i < Math.min(projectIds.length, seed.projectRatings.length); i++) {
        const pr = seed.projectRatings[i]!;
        await prisma.performanceReviewProjectRating.create({
          data: {
            reviewId: review.id,
            projectId: projectIds[i]!,
            ratedById: reviewer.id,
            rating: pr.rating,
            comment: pr.comment,
          },
        });
        ratingsCreated++;
      }
    }
  }

  console.log(`Sample performance reviews: ${created} created, ${skipped} skipped, ${ratingsCreated} project ratings.`);
}

// Allow standalone execution (skip when bundled into another entrypoint)
const __argv1 = process.argv[1] ?? "";
const isMain =
  import.meta.url === `file://${__argv1}` &&
  (__argv1.endsWith("sample-performance-reviews.ts") || __argv1.endsWith("sample-performance-reviews.js"));
if (isMain) {
  ensureSamplePerformanceReviews()
    .then(() => prisma.$disconnect())
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
