export const ALL_LECTURERS = "__all_lecturers__";
export const NEW_LECTURER = "__new_lecturer__";
export const LECTURE_WEEK_OPTIONS = Array.from({ length: 52 }, (_, index) => index + 1);

export function compareText(left: unknown, right: unknown) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

export function lecturerFolderLabel(lecturer: unknown) {
  const safeLecturer = typeof lecturer === "string" && lecturer.trim() ? lecturer : "Lecturer not detected";
  if (/not detected|unknown|unassigned/i.test(safeLecturer)) return "Unassigned";
  const name = safeLecturer.split(",")[0].trim();
  return name.split(/\s+/).at(-1) || safeLecturer;
}

export function lectureWeekValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 52 ? value : null;
}

export function lectureWeekLabel(value: unknown) {
  const week = lectureWeekValue(value);
  return week === null ? "Week unassigned" : `Week ${week}`;
}

export function compareLectureWeeks(left: unknown, right: unknown) {
  return (lectureWeekValue(left) ?? Number.POSITIVE_INFINITY) - (lectureWeekValue(right) ?? Number.POSITIVE_INFINITY);
}
