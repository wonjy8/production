// Canonical TypeScript implementation; ../grade-calculator.js is a compatibility export.
export const gradeLabels = ['A+','A0','A-','B+','B0','B-','C+','C0','C-','D+','D0','D-','F','P','NP'];
export function gradePoints(grade, scale = '4.5') {
 const tables = {
  '4.5': {'A+':4.5,A0:4,'B+':3.5,B0:3,'C+':2.5,C0:2,'D+':1.5,D0:1,F:0},
  '4.3': {'A+':4.3,A0:4,'A-':3.7,'B+':3.3,B0:3,'B-':2.7,'C+':2.3,C0:2,'C-':1.7,'D+':1.3,D0:1,'D-':0.7,F:0},
  '4.0': {'A+':4,A0:4,'A-':3.7,'B+':3.3,B0:3,'B-':2.7,'C+':2.3,C0:2,'C-':1.7,'D+':1.3,D0:1,'D-':0.7,F:0},
 };
 return tables[scale]?.[grade] ?? null;
}
export function calculateGrades(courses = [], scale = '4.5') {
 let attempted=0, earned=0, graded=0, weighted=0;
 for (const course of courses) {
  const credits=Number(course.credits);
  if (!Number.isFinite(credits)||credits<=0||!gradeLabels.includes(course.grade)) continue;
  const points=gradePoints(course.grade,scale);
  if (points===null&&!['P','NP'].includes(course.grade)) continue;
  attempted+=credits;
  if (!['F','NP'].includes(course.grade)) earned+=credits;
  if (points!==null) {graded+=credits;weighted+=credits*points;}
 }
 return {attempted,earned,graded,gpa:graded?weighted/graded:null};
}
