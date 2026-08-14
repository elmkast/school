export const ALL_LECTURERS = "__all_lecturers__";
export const NEW_LECTURER = "__new_lecturer__";

export function compareText(left: unknown, right: unknown) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

export function lecturerFolderLabel(lecturer: unknown) {
  const safeLecturer = typeof lecturer === "string" && lecturer.trim() ? lecturer : "Lecturer not detected";
  if (/not detected|unknown|unassigned/i.test(safeLecturer)) return "Unassigned";
  const name = safeLecturer.split(",")[0].trim();
  return name.split(/\s+/).at(-1) || safeLecturer;
}

export function lectureDateTimestamp(value: unknown) {
  const timestamp = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function dateInputValue(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function displayDateFromInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

