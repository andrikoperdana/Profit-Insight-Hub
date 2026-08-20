export function isSurveyAvailableStatus(status: string): boolean {
  return status === "COMPLETE" || status === "CLOSED";
}

export function isSurveyLinkUnavailable(project: {
  deletedAt: Date | null;
  archivedAt?: Date | null;
  kind: string;
  status: string;
  surveyEnabled: boolean;
  surveyExpiresAt: Date | null;
}): boolean {
  if (
    project.deletedAt ||
    project.archivedAt ||
    project.kind !== "CLIENT" ||
    !isSurveyAvailableStatus(project.status)
  ) {
    return true;
  }
  if (!project.surveyEnabled) return true;
  if (
    project.surveyExpiresAt &&
    project.surveyExpiresAt.getTime() < Date.now()
  ) {
    return true;
  }
  return false;
}