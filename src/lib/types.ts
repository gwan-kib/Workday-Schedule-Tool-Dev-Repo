export type TimeFormat = "am/pm" | "24h";
export type SemesterKey = "winter1" | "winter2" | "summer1" | "summer2";
export type MainPanelKey = "course-list-panel" | "schedule-panel";
export type UtilityPanelKey = "settings-panel" | "help-panel";
export type PanelKey = MainPanelKey | UtilityPanelKey;
export type SortableKey = "title" | "meeting" | "instructionalFormat";

export interface CourseData {
  code: string;
  title: string;
  section_number: string;
  instructor: string;
  meeting: string;
  instructionalFormat: string;
  startDate?: string;
  endDate?: string;
  meetingLines: string[];
  isLab?: boolean;
  isSeminar?: boolean;
  isDiscussion?: boolean;
  colorIndex?: number;
}

export interface SavedSchedule {
  id: string;
  name: string;
  savedAt: string;
  courses: CourseData[];
  colorAssignments: number[] | null;
  isFavorite: boolean;
}

export interface SchedulePickerOption {
  id: string;
  title: string;
  courseNames: string[];
  courseCount: number;
}

export interface SortState {
  key: SortableKey | null;
  dir: 1 | -1;
}

export interface ViewState {
  panel: PanelKey;
  lastMainPanel: MainPanelKey;
  semester: SemesterKey | null;
  timeFormat: TimeFormat;
  hoverTipsEnabled: boolean;
  isPanelOpen: boolean;
}

export interface AverageCourseInfo {
  subject: string;
  course: string;
  section: string;
  campus: "UBCV" | "UBCO";
}

export interface ProfessorLookupInfo {
  profName: string;
  campus: "UBCV" | "UBCO";
}

export interface ProfessorRating {
  rating: number | string;
  link?: string | null;
}

export interface ScheduleEvent {
  id: number;
  colorIndex: number;
  eventType: "" | "lab" | "seminar" | "discussion";
  code: string;
  title: string;
  label: string;
  startMinutes: number;
  endMinutes: number;
  rowStart: number;
  rowSpan: number;
  startIdx: number;
  endIdx: number;
}

export interface ConflictBlock {
  day: string;
  rowStart: number;
  rowSpan: number;
  startIdx: number;
  endIdx: number;
  codes: string[];
}

export interface ScheduleRenderUi {
  root?: ParentNode | null;
  footerAlert?: HTMLElement | null;
  scheduleGrid?: HTMLElement | null;
  schedulePanel?: HTMLElement | null;
  scheduleContainer?: HTMLElement | null;
  scheduleView?: HTMLElement | null;
  schedule?: HTMLElement | null;
  scheduleTermPill?: HTMLElement | null;
  conflictPartnersByCode?: Map<string, string[]>;
  activeSemester?: SemesterKey | null;
}

export interface CourseColorPalette {
  id: number;
  label: string;
  bg: string;
  border: string;
  chip: string;
  subBg: string;
  subChip: string;
}

export interface TermCampusInfo {
  campus: "UBCV" | "UBCO";
  yearsession: string;
}

export interface ContentBootstrapState {
  courses: CourseData[];
  filteredCourses: CourseData[];
  savedSchedules: SavedSchedule[];
  currentSavedScheduleId: string | null;
  currentScheduleName: string | null;
  searchQuery: string;
  sort: SortState;
  view: ViewState;
}
