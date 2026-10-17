import {holidayName,redCalendarDate} from './calendar-holidays.js';
import {projectColorStyle} from './project-colors.js';
import { useState } from "react";
import { IconButton } from "./Icon";
import { localDay } from "./admin-home-model.js";
export function ScheduleCalendar({
  schedules,
  onOpen,
}: {
  schedules: any[];
  onOpen: (schedule: any) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = localDay();
  return (
    <section className="schedule-month" aria-label="일정 캘린더">
      <header>
        <IconButton
          name="chevronLeft"
          label="이전 달"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        />
        <h2>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </h2>
        <IconButton
          name="chevronRight"
          label="다음 달"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        />
        <button
          className="keep-label"
          onClick={() =>
            setMonth(
              new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            )
          }
        >
          오늘
        </button>
      </header>
      <div className="schedule-month-grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <strong className={"schedule-weekday"+(["일","토"].includes(day)?" calendar-red":"")} key={day}>
            {day}
          </strong>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const date = new Date(start);
          date.setDate(start.getDate() + i);
          const key = localDay(date),
            rows = schedules.filter(
              (s) => s.date <= key && (s.endDate || s.date) >= key,
            );
          return (
            <div
              className={
                "schedule-month-day" +(redCalendarDate(key)?" calendar-red":"") +
                (date.getMonth() !== month.getMonth() ? " outside-month" : "")
              }
              data-date={key}
              key={key}
            >
              <span aria-current={key === today ? "date" : undefined}>
                {date.getDate()}{holidayName(key)&&<small className="calendar-holiday">{holidayName(key)}</small>}
              </span>
              {rows.map((s) => (
                <button
                  className={
                    "keep-label schedule-month-event" +
                    (s.done ? " is-done" : "")
                  }
                  style={projectColorStyle(s.color)}
                  key={s.key || s.id}
                  title={
                    (s.startTime || "종일") +
                    " " +
                    s.title +
                    " · " +
                    s.origin.label
                  }
                  onClick={() => onOpen(s)}
                >
                  <small>{s.startTime || "종일"}</small>
                  <span>{s.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
