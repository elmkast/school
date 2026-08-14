import type { Lecture } from "../../lib/lecture-store";
import { ALL_LECTURERS, compareText, lecturerFolderLabel } from "../../lib/curriculum";
import { AppIcon } from "./AppIcon";

type CurriculumTreeProps = {
  lectures: Lecture[];
  academicYears: string[];
  coursesByYear: Record<string, string[]>;
  expandedYear: string | null;
  expandedCourse: string | null;
  selectedYear: string;
  selectedCourse: string;
  selectedLecturer: string;
  allSelected: boolean;
  isCurrentSection: boolean;
  showCounts?: boolean;
  countItems?: (items: Lecture[]) => number;
  flaggedSelected?: boolean;
  onSelectFlagged?: () => void;
  onSelectYear: (year: string) => void;
  onSelectCourse: (year: string, course: string, courseKey: string) => void;
  onSelectLecturer: (year: string, course: string, lecturer: string) => void;
};

export function CurriculumTree({ lectures, academicYears, coursesByYear, expandedYear, expandedCourse, selectedYear, selectedCourse, selectedLecturer, allSelected, isCurrentSection, showCounts = true, countItems = (items) => items.length, flaggedSelected = false, onSelectFlagged, onSelectYear, onSelectCourse, onSelectLecturer }: CurriculumTreeProps) {
  const folderSelectionIsCurrent = isCurrentSection && !allSelected && !flaggedSelected;
  return <div className="nav-tree">
    {onSelectFlagged && <button className={`tree-all flagged-node ${isCurrentSection && flaggedSelected ? "active" : ""}`} onClick={onSelectFlagged}><span><AppIcon name="flag"/>Flagged SLOs</span></button>}
    {academicYears.map((year) => {
      const yearLectures = lectures.filter((lecture) => lecture.academicYear === year);
      const yearSelected = folderSelectionIsCurrent && selectedYear === year && selectedCourse === "All courses" && selectedLecturer === ALL_LECTURERS;
      return <div className="tree-branch" key={year}>
        <button className={`year-toggle ${expandedYear === year ? "expanded" : ""} ${yearSelected ? "active" : ""}`} aria-expanded={expandedYear === year} onClick={() => onSelectYear(year)}><span className="tree-chevron">›</span><AppIcon name="folder"/><strong>{year}</strong>{showCounts && <b>{countItems(yearLectures)}</b>}</button>
        {expandedYear === year && <div className="tree-children">{(coursesByYear[year] ?? []).map((course) => {
          const courseLectures = yearLectures.filter((lecture) => lecture.course === course);
          const courseKey = `${year}::${course}`;
          const lecturers = Array.from(new Set(courseLectures.map((lecture) => lecture.lecturer))).sort((a, b) => compareText(lecturerFolderLabel(a), lecturerFolderLabel(b)));
          const courseSelected = folderSelectionIsCurrent && selectedYear === year && selectedCourse === course;
          return <div className="course-branch" key={course}>
            <button className={`course-toggle ${expandedCourse === courseKey ? "expanded" : ""} ${courseSelected && selectedLecturer === ALL_LECTURERS ? "active" : ""}`} aria-expanded={expandedCourse === courseKey} onClick={() => onSelectCourse(year, course, courseKey)}><span className="tree-chevron">›</span><AppIcon name="folder"/><span>{course}</span>{showCounts && <b>{countItems(courseLectures)}</b>}</button>
            {expandedCourse === courseKey && <div className="lecturer-children">{lecturers.map((lecturer) => {
              const lecturerLectures = courseLectures.filter((lecture) => lecture.lecturer === lecturer);
              return <button key={lecturer} className={courseSelected && selectedLecturer === lecturer ? "active" : ""} onClick={() => onSelectLecturer(year, course, lecturer)}><span>{lecturerFolderLabel(lecturer)}</span>{showCounts && <b>{countItems(lecturerLectures)}</b>}</button>;
            })}</div>}
          </div>;
        })}</div>}
      </div>;
    })}
  </div>;
}


