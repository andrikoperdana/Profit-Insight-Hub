import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get(
  "/skill-matrix",
  requireAuth,
  requireRole("MANAGEMENT", "PROJECT_MANAGER", "HR"),
  async (_req, res) => {
    const [skills, users] = await Promise.all([
      prisma.skill.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          role: {
            in: [
              "KONSULTAN",
              "TECHNICAL_WRITER",
              "PRINCIPAL_KONSULTAN",
              "PRINCIPAL_TECHNICAL_WRITER",
            ],
          },
        },
        include: { skills: true, businessUnit: true },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    const cells = users.flatMap((u) =>
      u.skills.map((us) => ({
        skillId: us.skillId,
        userId: u.id,
        proficiency: us.proficiency,
      })),
    );

    const gaps = skills.map((s) => {
      const holders = users.filter((u) =>
        u.skills.some((us) => us.skillId === s.id),
      );
      const cellsForSkill = cells.filter((c) => c.skillId === s.id);
      const juniorCount = holders.filter((u) => u.seniority === "JUNIOR").length;
      const midCount = holders.filter((u) => u.seniority === "MID").length;
      const seniorCount = holders.filter((u) => u.seniority === "SENIOR").length;
      const principalCount = holders.filter((u) => u.seniority === "PRINCIPAL").length;
      const totalCount = holders.length;
      const avgProf =
        cellsForSkill.length === 0
          ? 0
          : cellsForSkill.reduce((s, c) => s + c.proficiency, 0) /
            cellsForSkill.length;
      let isGap = false;
      let gapReason: string | null = null;
      if (totalCount === 0) {
        isGap = true;
        gapReason = "No consultant holds this skill yet";
      } else if (totalCount < 2) {
        isGap = true;
        gapReason = "Only 1 person — key-person risk";
      } else if (seniorCount + principalCount === 0) {
        isGap = true;
        gapReason = "No Senior/Principal available as mentor";
      }
      return {
        skillId: s.id,
        skillName: s.name,
        category: s.category,
        totalCount,
        juniorCount,
        midCount,
        seniorCount,
        principalCount,
        avgProficiency: Math.round(avgProf * 10) / 10,
        isGap,
        gapReason,
      };
    });

    res.json({
      skills,
      users: users.map((u) => ({
        userId: u.id,
        userName: u.name,
        role: u.role,
        seniority: u.seniority,
        businessUnitName: u.businessUnit?.name ?? null,
      })),
      cells,
      gaps,
    });
  },
);

export default router;
