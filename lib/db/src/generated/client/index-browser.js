
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  role: 'role',
  title: 'title',
  dailyRate: 'dailyRate',
  seniority: 'seniority',
  isActive: 'isActive',
  avatarDataUrl: 'avatarDataUrl',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  businessUnitId: 'businessUnitId',
  managerId: 'managerId',
  principalId: 'principalId',
  calendarTokenVersion: 'calendarTokenVersion'
};

exports.Prisma.AccessRequestScalarFieldEnum = {
  id: 'id',
  email: 'email',
  name: 'name',
  googleSub: 'googleSub',
  status: 'status',
  decidedById: 'decidedById',
  decidedAt: 'decidedAt',
  createdUserId: 'createdUserId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ClientScalarFieldEnum = {
  id: 'id',
  name: 'name',
  contactPerson: 'contactPerson',
  email: 'email',
  phone: 'phone',
  industry: 'industry',
  xeroContactId: 'xeroContactId',
  pipedriveOrgId: 'pipedriveOrgId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  code: 'code',
  name: 'name',
  description: 'description',
  status: 'status',
  kind: 'kind',
  clientId: 'clientId',
  salesId: 'salesId',
  pmId: 'pmId',
  technicalWriterId: 'technicalWriterId',
  adminProjectId: 'adminProjectId',
  startDate: 'startDate',
  endDate: 'endDate',
  contractValue: 'contractValue',
  currency: 'currency',
  exchangeRate: 'exchangeRate',
  vatPercent: 'vatPercent',
  contractValueIncludesVat: 'contractValueIncludesVat',
  estimatedCost: 'estimatedCost',
  plannedMandays: 'plannedMandays',
  lastStatusReason: 'lastStatusReason',
  reportCoverUrl: 'reportCoverUrl',
  reportLink: 'reportLink',
  reportSubmittedAt: 'reportSubmittedAt',
  spkFileUrl: 'spkFileUrl',
  spkFileName: 'spkFileName',
  contractFileUrl: 'contractFileUrl',
  contractFileName: 'contractFileName',
  archivedAt: 'archivedAt',
  closedAt: 'closedAt',
  autoArchiveExempt: 'autoArchiveExempt',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  useWorkstreams: 'useWorkstreams',
  surveyToken: 'surveyToken',
  surveyEnabled: 'surveyEnabled',
  surveyExpiresAt: 'surveyExpiresAt',
  csatWaivedAt: 'csatWaivedAt',
  csatWaivedById: 'csatWaivedById',
  csatWaiverReason: 'csatWaiverReason',
  clientShareToken: 'clientShareToken',
  clientShareEnabled: 'clientShareEnabled',
  clientShareExpiresAt: 'clientShareExpiresAt'
};

exports.Prisma.ProjectBaselineScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  version: 'version',
  isCurrent: 'isCurrent',
  source: 'source',
  changeRequestId: 'changeRequestId',
  startDate: 'startDate',
  endDate: 'endDate',
  plannedMandays: 'plannedMandays',
  estimatedCost: 'estimatedCost',
  contractValue: 'contractValue',
  createdById: 'createdById',
  createdAt: 'createdAt'
};

exports.Prisma.ChangeRequestScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  type: 'type',
  status: 'status',
  title: 'title',
  description: 'description',
  impactSummary: 'impactSummary',
  proposedStartDate: 'proposedStartDate',
  proposedEndDate: 'proposedEndDate',
  proposedPlannedMandays: 'proposedPlannedMandays',
  proposedEstimatedCost: 'proposedEstimatedCost',
  proposedContractValue: 'proposedContractValue',
  requestedById: 'requestedById',
  decidedById: 'decidedById',
  decidedAt: 'decidedAt',
  decisionNote: 'decisionNote',
  appliedAt: 'appliedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectReportScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  title: 'title',
  reportNumber: 'reportNumber',
  version: 'version',
  reportType: 'reportType',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  author: 'author',
  coverUrl: 'coverUrl',
  link: 'link',
  note: 'note',
  workstreamId: 'workstreamId',
  submittedAt: 'submittedAt',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectWorkstreamScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  code: 'code',
  name: 'name',
  description: 'description',
  businessUnitId: 'businessUnitId',
  allocationPct: 'allocationPct',
  plannedMandays: 'plannedMandays',
  estimatedCost: 'estimatedCost',
  startDate: 'startDate',
  endDate: 'endDate',
  status: 'status',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SurveyQuestionScalarFieldEnum = {
  id: 'id',
  key: 'key',
  text: 'text',
  type: 'type',
  order: 'order',
  required: 'required',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RateLimitCounterScalarFieldEnum = {
  key: 'key',
  count: 'count',
  resetAt: 'resetAt'
};

exports.Prisma.SurveyResponseScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  submitterName: 'submitterName',
  submitterEmail: 'submitterEmail',
  answers: 'answers',
  questionsSnapshot: 'questionsSnapshot',
  lessonLearned: 'lessonLearned',
  createdAt: 'createdAt'
};

exports.Prisma.ProjectFeedback360ScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  reviewerId: 'reviewerId',
  subjectId: 'subjectId',
  rating: 'rating',
  comment: 'comment',
  status: 'status',
  submittedAt: 'submittedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  userName: 'userName',
  userRole: 'userRole',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  description: 'description',
  dataBefore: 'dataBefore',
  dataAfter: 'dataAfter',
  createdAt: 'createdAt'
};

exports.Prisma.ProjectResourceScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  workstreamId: 'workstreamId',
  userId: 'userId',
  roleInProject: 'roleInProject',
  plannedMandays: 'plannedMandays',
  dailyRate: 'dailyRate',
  proposedById: 'proposedById',
  proposedAt: 'proposedAt',
  acceptedAt: 'acceptedAt',
  pendingPrincipalApproval: 'pendingPrincipalApproval',
  createdAt: 'createdAt'
};

exports.Prisma.ProjectResourceRateScalarFieldEnum = {
  id: 'id',
  resourceId: 'resourceId',
  costRate: 'costRate',
  sellingRate: 'sellingRate',
  effectiveFrom: 'effectiveFrom',
  createdById: 'createdById',
  createdAt: 'createdAt'
};

exports.Prisma.TimesheetScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  workstreamId: 'workstreamId',
  userId: 'userId',
  taskId: 'taskId',
  workDate: 'workDate',
  hours: 'hours',
  description: 'description',
  status: 'status',
  approvedById: 'approvedById',
  approvedAt: 'approvedAt',
  rejectionReason: 'rejectionReason',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DocumentScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  type: 'type',
  kind: 'kind',
  fileName: 'fileName',
  fileUrl: 'fileUrl',
  invoiceNumber: 'invoiceNumber',
  invoiceAmount: 'invoiceAmount',
  invoiceStatus: 'invoiceStatus',
  notes: 'notes',
  uploadedById: 'uploadedById',
  uploadedAt: 'uploadedAt',
  version: 'version',
  parentDocumentId: 'parentDocumentId',
  isLatest: 'isLatest',
  billingMilestoneId: 'billingMilestoneId'
};

exports.Prisma.ProjectClosingChecklistItemScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  key: 'key',
  label: 'label',
  status: 'status',
  note: 'note',
  completedAt: 'completedAt',
  completedById: 'completedById',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectExpenseScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  workstreamId: 'workstreamId',
  category: 'category',
  description: 'description',
  amount: 'amount',
  spentAt: 'spentAt',
  evidenceUrl: 'evidenceUrl',
  evidenceFileName: 'evidenceFileName',
  status: 'status',
  approvedById: 'approvedById',
  approvedAt: 'approvedAt',
  rejectionReason: 'rejectionReason',
  poNumber: 'poNumber',
  settledAmount: 'settledAmount',
  settledAt: 'settledAt',
  settlementNotes: 'settlementNotes',
  settledById: 'settledById',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BusinessUnitScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SkillScalarFieldEnum = {
  id: 'id',
  name: 'name',
  category: 'category',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserSkillScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  skillId: 'skillId',
  proficiency: 'proficiency',
  createdAt: 'createdAt'
};

exports.Prisma.SkillDevelopmentGoalScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  skillId: 'skillId',
  currentLevel: 'currentLevel',
  targetLevel: 'targetLevel',
  targetDate: 'targetDate',
  status: 'status',
  notes: 'notes',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  completedAt: 'completedAt'
};

exports.Prisma.SkillProgressionLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  skillId: 'skillId',
  fromLevel: 'fromLevel',
  toLevel: 'toLevel',
  changedById: 'changedById',
  note: 'note',
  createdAt: 'createdAt'
};

exports.Prisma.ActivityScalarFieldEnum = {
  id: 'id',
  type: 'type',
  message: 'message',
  userId: 'userId',
  projectId: 'projectId',
  createdAt: 'createdAt'
};

exports.Prisma.TaskScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  workstreamId: 'workstreamId',
  title: 'title',
  description: 'description',
  status: 'status',
  progressPercent: 'progressPercent',
  billable: 'billable',
  plannedHours: 'plannedHours',
  startDate: 'startDate',
  endDate: 'endDate',
  assigneeId: 'assigneeId',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  parentTaskId: 'parentTaskId'
};

exports.Prisma.TaskDependencyScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  dependsOnTaskId: 'dependsOnTaskId',
  createdAt: 'createdAt'
};

exports.Prisma.BillingMilestoneScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  workstreamId: 'workstreamId',
  name: 'name',
  description: 'description',
  percentage: 'percentage',
  amount: 'amount',
  dueDate: 'dueDate',
  status: 'status',
  invoiceNumber: 'invoiceNumber',
  xeroInvoiceId: 'xeroInvoiceId',
  xeroInvoiceNumber: 'xeroInvoiceNumber',
  xeroAmountDue: 'xeroAmountDue',
  xeroAmountPaid: 'xeroAmountPaid',
  xeroAmountCredited: 'xeroAmountCredited',
  xeroSyncedAt: 'xeroSyncedAt',
  invoicedAt: 'invoicedAt',
  paidAt: 'paidAt',
  reportUrl: 'reportUrl',
  reportFiledAt: 'reportFiledAt',
  sortOrder: 'sortOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskAssigneeScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  userId: 'userId',
  createdAt: 'createdAt'
};

exports.Prisma.TaskTimeLogScalarFieldEnum = {
  id: 'id',
  taskId: 'taskId',
  userId: 'userId',
  hours: 'hours',
  note: 'note',
  loggedAt: 'loggedAt',
  createdAt: 'createdAt'
};

exports.Prisma.LeadScalarFieldEnum = {
  id: 'id',
  title: 'title',
  contactName: 'contactName',
  contactEmail: 'contactEmail',
  contactPhone: 'contactPhone',
  clientId: 'clientId',
  prospectiveClientName: 'prospectiveClientName',
  industry: 'industry',
  source: 'source',
  region: 'region',
  stage: 'stage',
  estimatedValue: 'estimatedValue',
  probability: 'probability',
  expectedCloseDate: 'expectedCloseDate',
  ownerId: 'ownerId',
  notes: 'notes',
  lostReason: 'lostReason',
  competitorWon: 'competitorWon',
  convertedProjectId: 'convertedProjectId',
  wonAt: 'wonAt',
  lostAt: 'lostAt',
  deletedAt: 'deletedAt',
  pipedriveDealId: 'pipedriveDealId',
  pipedrivePersonId: 'pipedrivePersonId',
  pipedriveUpdatedAt: 'pipedriveUpdatedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LeadActivityScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  type: 'type',
  occurredAt: 'occurredAt',
  outcome: 'outcome',
  nextActionAt: 'nextActionAt',
  nextActionNote: 'nextActionNote',
  createdById: 'createdById',
  createdAt: 'createdAt'
};

exports.Prisma.UserLeaveScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  startDate: 'startDate',
  endDate: 'endDate',
  type: 'type',
  note: 'note',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaskTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  businessUnitId: 'businessUnitId',
  tasks: 'tasks',
  createdById: 'createdById',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  businessUnitId: 'businessUnitId',
  kind: 'kind',
  defaultDurationDays: 'defaultDurationDays',
  estimatedContractValue: 'estimatedContractValue',
  estimatedCost: 'estimatedCost',
  plannedMandays: 'plannedMandays',
  vatPercent: 'vatPercent',
  contractValueIncludesVat: 'contractValueIncludesVat',
  taskTemplateId: 'taskTemplateId',
  isActive: 'isActive',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProjectTemplateResourceScalarFieldEnum = {
  id: 'id',
  templateId: 'templateId',
  role: 'role',
  count: 'count',
  plannedMandays: 'plannedMandays',
  dailyRate: 'dailyRate',
  note: 'note',
  createdAt: 'createdAt'
};

exports.Prisma.ProjectTemplateMilestoneScalarFieldEnum = {
  id: 'id',
  templateId: 'templateId',
  name: 'name',
  percentage: 'percentage',
  offsetDays: 'offsetDays',
  order: 'order',
  createdAt: 'createdAt'
};

exports.Prisma.ProjectTemplateRaidItemScalarFieldEnum = {
  id: 'id',
  templateId: 'templateId',
  type: 'type',
  title: 'title',
  description: 'description',
  impact: 'impact',
  likelihood: 'likelihood',
  mitigation: 'mitigation',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  title: 'title',
  message: 'message',
  link: 'link',
  readAt: 'readAt',
  createdAt: 'createdAt'
};

exports.Prisma.ProjectRaidItemScalarFieldEnum = {
  id: 'id',
  projectId: 'projectId',
  type: 'type',
  title: 'title',
  description: 'description',
  impact: 'impact',
  likelihood: 'likelihood',
  status: 'status',
  ownerId: 'ownerId',
  mitigation: 'mitigation',
  responseStrategy: 'responseStrategy',
  dueDate: 'dueDate',
  closedAt: 'closedAt',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PerformanceReviewScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  reviewerId: 'reviewerId',
  period: 'period',
  periodYear: 'periodYear',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  status: 'status',
  overallRating: 'overallRating',
  summary: 'summary',
  strengths: 'strengths',
  improvements: 'improvements',
  goals: 'goals',
  acknowledgement: 'acknowledgement',
  submittedAt: 'submittedAt',
  acknowledgedAt: 'acknowledgedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PerformanceReviewProjectRatingScalarFieldEnum = {
  id: 'id',
  reviewId: 'reviewId',
  projectId: 'projectId',
  ratedById: 'ratedById',
  rating: 'rating',
  comment: 'comment',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InvoiceSettingScalarFieldEnum = {
  id: 'id',
  companyName: 'companyName',
  brand: 'brand',
  addressLines: 'addressLines',
  npwp: 'npwp',
  email: 'email',
  phone: 'phone',
  city: 'city',
  bankName: 'bankName',
  bankAccountName: 'bankAccountName',
  bankAccountNumber: 'bankAccountNumber',
  updatedAt: 'updatedAt',
  updatedById: 'updatedById'
};

exports.Prisma.AppSettingScalarFieldEnum = {
  id: 'id',
  defaultVatPercent: 'defaultVatPercent',
  timesheetBackdateDays: 'timesheetBackdateDays',
  lowMarginPct: 'lowMarginPct',
  budgetOverrunPct: 'budgetOverrunPct',
  invoiceDueSoonDays: 'invoiceDueSoonDays',
  lateTimesheetDays: 'lateTimesheetDays',
  xeroAutoSyncEnabled: 'xeroAutoSyncEnabled',
  autoArchiveClosedMonths: 'autoArchiveClosedMonths',
  emailNotificationsEnabled: 'emailNotificationsEnabled',
  pipedriveAutoSyncEnabled: 'pipedriveAutoSyncEnabled',
  pipedriveLastSyncAt: 'pipedriveLastSyncAt',
  pipedriveDefaultOwnerId: 'pipedriveDefaultOwnerId',
  pipedriveWebhookSecret: 'pipedriveWebhookSecret',
  pipedriveSyncRunId: 'pipedriveSyncRunId',
  pipedriveSyncStartedAt: 'pipedriveSyncStartedAt',
  pipedriveSyncFinishedAt: 'pipedriveSyncFinishedAt',
  pipedriveSyncError: 'pipedriveSyncError',
  pipedriveSyncResult: 'pipedriveSyncResult',
  notificationChecksLastRunAt: 'notificationChecksLastRunAt',
  updatedAt: 'updatedAt',
  updatedById: 'updatedById'
};

exports.Prisma.ExecutiveBriefingScalarFieldEnum = {
  id: 'id',
  generatedAt: 'generatedAt',
  model: 'model',
  payload: 'payload',
  updatedAt: 'updatedAt'
};

exports.Prisma.AiWeeklyDigestScalarFieldEnum = {
  id: 'id',
  generatedAt: 'generatedAt',
  model: 'model',
  payload: 'payload',
  createdAt: 'createdAt'
};

exports.Prisma.PipedriveStageMappingScalarFieldEnum = {
  id: 'id',
  pipedrivePipelineId: 'pipedrivePipelineId',
  pipedriveStageId: 'pipedriveStageId',
  leadStage: 'leadStage',
  label: 'label',
  updatedAt: 'updatedAt'
};

exports.Prisma.XeroConnectionScalarFieldEnum = {
  id: 'id',
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  expiresAt: 'expiresAt',
  tenantId: 'tenantId',
  tenantName: 'tenantName',
  connectedAt: 'connectedAt',
  connectedById: 'connectedById',
  disconnectedAt: 'disconnectedAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.UserRole = exports.$Enums.UserRole = {
  MANAGEMENT: 'MANAGEMENT',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  SALES: 'SALES',
  KONSULTAN: 'KONSULTAN',
  TECHNICAL_WRITER: 'TECHNICAL_WRITER',
  ADMIN_PROJECT: 'ADMIN_PROJECT',
  PRINCIPAL_KONSULTAN: 'PRINCIPAL_KONSULTAN',
  PRINCIPAL_TECHNICAL_WRITER: 'PRINCIPAL_TECHNICAL_WRITER',
  PRINCIPAL_ADMIN_PROJECT: 'PRINCIPAL_ADMIN_PROJECT',
  FINANCE: 'FINANCE',
  HR: 'HR',
  SITE_ADMIN: 'SITE_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN'
};

exports.Seniority = exports.$Enums.Seniority = {
  JUNIOR: 'JUNIOR',
  MID: 'MID',
  SENIOR: 'SENIOR',
  PRINCIPAL: 'PRINCIPAL'
};

exports.AccessRequestStatus = exports.$Enums.AccessRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.ProjectStatus = exports.$Enums.ProjectStatus = {
  DRAFT: 'DRAFT',
  OBSERVATION: 'OBSERVATION',
  ACTIVE: 'ACTIVE',
  NO_NEED_CONSULTANT: 'NO_NEED_CONSULTANT',
  PAUSE: 'PAUSE',
  COMPLETE: 'COMPLETE',
  CLOSED: 'CLOSED'
};

exports.ProjectKind = exports.$Enums.ProjectKind = {
  CLIENT: 'CLIENT',
  INTERNAL: 'INTERNAL',
  PRESALES: 'PRESALES',
  TRAINING: 'TRAINING'
};

exports.ProjectBaselineSource = exports.$Enums.ProjectBaselineSource = {
  ACTIVATION: 'ACTIVATION',
  CHANGE_REQUEST: 'CHANGE_REQUEST',
  MANUAL: 'MANUAL'
};

exports.ChangeRequestType = exports.$Enums.ChangeRequestType = {
  SCOPE: 'SCOPE',
  SCHEDULE: 'SCHEDULE',
  COST: 'COST'
};

exports.ChangeRequestStatus = exports.$Enums.ChangeRequestStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED'
};

exports.ProjectReportType = exports.$Enums.ProjectReportType = {
  DRAFT: 'DRAFT',
  INTERIM: 'INTERIM',
  FINAL: 'FINAL'
};

exports.Feedback360Status = exports.$Enums.Feedback360Status = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED'
};

exports.TimesheetStatus = exports.$Enums.TimesheetStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.DocumentType = exports.$Enums.DocumentType = {
  BAST: 'BAST',
  INVOICE: 'INVOICE',
  CONTRACT: 'CONTRACT',
  REPORT: 'REPORT',
  OTHER: 'OTHER'
};

exports.DocumentKind = exports.$Enums.DocumentKind = {
  FILE: 'FILE',
  LINK: 'LINK'
};

exports.ExpenseStatus = exports.$Enums.ExpenseStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.TaskStatus = exports.$Enums.TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE'
};

exports.BillingMilestoneStatus = exports.$Enums.BillingMilestoneStatus = {
  PLANNED: 'PLANNED',
  INVOICED: 'INVOICED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED'
};

exports.LeadStage = exports.$Enums.LeadStage = {
  NEW: 'NEW',
  QUALIFIED: 'QUALIFIED',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST'
};

exports.LeadActivityType = exports.$Enums.LeadActivityType = {
  CALL: 'CALL',
  EMAIL: 'EMAIL',
  MEETING: 'MEETING',
  NOTE: 'NOTE'
};

exports.LeaveType = exports.$Enums.LeaveType = {
  ANNUAL: 'ANNUAL',
  SICK: 'SICK',
  TRAINING: 'TRAINING',
  UNPAID: 'UNPAID',
  OTHER: 'OTHER'
};

exports.RaidType = exports.$Enums.RaidType = {
  RISK: 'RISK',
  ASSUMPTION: 'ASSUMPTION',
  ISSUE: 'ISSUE',
  DEPENDENCY: 'DEPENDENCY'
};

exports.RaidImpact = exports.$Enums.RaidImpact = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

exports.RaidLikelihood = exports.$Enums.RaidLikelihood = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH'
};

exports.RaidStatus = exports.$Enums.RaidStatus = {
  OPEN: 'OPEN',
  MITIGATING: 'MITIGATING',
  CLOSED: 'CLOSED'
};

exports.RaidResponseStrategy = exports.$Enums.RaidResponseStrategy = {
  AVOID: 'AVOID',
  MITIGATE: 'MITIGATE',
  TRANSFER: 'TRANSFER',
  ACCEPT: 'ACCEPT'
};

exports.PerformanceReviewPeriod = exports.$Enums.PerformanceReviewPeriod = {
  Q1: 'Q1',
  Q2: 'Q2',
  Q3: 'Q3',
  Q4: 'Q4',
  ANNUAL: 'ANNUAL'
};

exports.PerformanceReviewStatus = exports.$Enums.PerformanceReviewStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  ACKNOWLEDGED: 'ACKNOWLEDGED'
};

exports.Prisma.ModelName = {
  User: 'User',
  AccessRequest: 'AccessRequest',
  Client: 'Client',
  Project: 'Project',
  ProjectBaseline: 'ProjectBaseline',
  ChangeRequest: 'ChangeRequest',
  ProjectReport: 'ProjectReport',
  ProjectWorkstream: 'ProjectWorkstream',
  SurveyQuestion: 'SurveyQuestion',
  RateLimitCounter: 'RateLimitCounter',
  SurveyResponse: 'SurveyResponse',
  ProjectFeedback360: 'ProjectFeedback360',
  AuditLog: 'AuditLog',
  ProjectResource: 'ProjectResource',
  ProjectResourceRate: 'ProjectResourceRate',
  Timesheet: 'Timesheet',
  Document: 'Document',
  ProjectClosingChecklistItem: 'ProjectClosingChecklistItem',
  ProjectExpense: 'ProjectExpense',
  BusinessUnit: 'BusinessUnit',
  Skill: 'Skill',
  UserSkill: 'UserSkill',
  SkillDevelopmentGoal: 'SkillDevelopmentGoal',
  SkillProgressionLog: 'SkillProgressionLog',
  Activity: 'Activity',
  Task: 'Task',
  TaskDependency: 'TaskDependency',
  BillingMilestone: 'BillingMilestone',
  TaskAssignee: 'TaskAssignee',
  TaskTimeLog: 'TaskTimeLog',
  Lead: 'Lead',
  LeadActivity: 'LeadActivity',
  UserLeave: 'UserLeave',
  TaskTemplate: 'TaskTemplate',
  ProjectTemplate: 'ProjectTemplate',
  ProjectTemplateResource: 'ProjectTemplateResource',
  ProjectTemplateMilestone: 'ProjectTemplateMilestone',
  ProjectTemplateRaidItem: 'ProjectTemplateRaidItem',
  Notification: 'Notification',
  ProjectRaidItem: 'ProjectRaidItem',
  PerformanceReview: 'PerformanceReview',
  PerformanceReviewProjectRating: 'PerformanceReviewProjectRating',
  InvoiceSetting: 'InvoiceSetting',
  AppSetting: 'AppSetting',
  ExecutiveBriefing: 'ExecutiveBriefing',
  AiWeeklyDigest: 'AiWeeklyDigest',
  PipedriveStageMapping: 'PipedriveStageMapping',
  XeroConnection: 'XeroConnection'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
