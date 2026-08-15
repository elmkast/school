import type { Lecture } from "../../lib/lecture-store";
import { ALL_LECTURERS, compareText, lecturerFolderLabel } from "../../lib/curriculum";
import { SidebarTree, SidebarTreeItem } from "./SidebarSystem";

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
  onToggleYear: (year: string) => void;
  onToggleCourse: (courseKey: string) => void;
  onSelectYear: (year: string) => void;
  onSelectCourse: (year: string, course: string, courseKey: string) => void;
  onSelectLecturer: (year: string, course: string, lecturer: string) => void;
};

export function CurriculumTree({ lectures, academicYears, coursesByYear, expandedYear, expandedCourse, selectedYear, selectedCourse, selectedLecturer, allSelected, isCurrentSection, showCounts = true, countItems = (items) => items.length, flaggedSelected = false, onSelectFlagged, onToggleYear, onToggleCourse, onSelectYear, onSelectCourse, onSelectLecturer }: CurriculumTreeProps) {
  const folderSelectionIsCurrent = isCurrentSection && !allSelected && !flaggedSelected;
  return <SidebarTree>
    {onSelectFlagged && <SidebarTreeItem label="Flagged SLOs" active={isCurrentSection && flaggedSelected} onClick={onSelectFlagged} />}
    {academicYears.map((year) => {
      const yearLectures = lectures.filter((lecture) => lecture.academicYear === year);
      const yearSelected = folderSelectionIsCurrent && selectedYear === year && selectedCourse === "All courses" && selectedLecturer === ALL_LECTURERS;
      return <div className="tree-branch" key={year}>
        <SidebarTreeItem label={year} count={showCounts ? countItems(yearLectures) : undefined} expandable expanded={expandedYear === year} active={yearSelected} onToggle={() => onToggleYear(year)} onClick={() => onSelectYear(year)} />
        {expandedYear === year && <>{(coursesByYear[year] ?? []).map((course) => {
          const courseLectures = yearLectures.filter((lecture) => lecture.course === course);
          const courseKey = `${year}::${course}`;
          const lecturers = Array.from(new Set(courseLectures.map((lecture) => lecture.lecturer))).sort((a, b) => compareText(lecturerFolderLabel(a), lecturerFolderLabel(b)));
          const courseSelected = folderSelectionIsCurrent && selectedYear === year && selectedCourse === course;
          return <div className="course-branch" key={course}>
            <SidebarTreeItem label={course} count={showCounts ? countItems(courseLectures) : undefined} depth={1} expandable expanded={expandedCourse === courseKey} active={courseSelected && selectedLecturer === ALL_LECTURERS} onToggle={() => onToggleCourse(courseKey)} onClick={() => onSelectCourse(year, course, courseKey)} />
            {expandedCourse === courseKey && <>{lecturers.map((lecturer) => {
              const lecturerLectures = courseLectures.filter((lecture) => lecture.lecturer === lecturer);
              return <SidebarTreeItem key={lecturer} label={lecturerFolderLabel(lecturer)} count={showCounts ? countItems(lecturerLectures) : undefined} depth={2} active={courseSelected && selectedLecturer === lecturer} onClick={() => onSelectLecturer(year, course, lecturer)} />;
            })}</>}
          </div>;
        })}</>}
      </div>;
    })}
  </SidebarTree>;
}
