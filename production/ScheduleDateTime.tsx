import { useEffect, useRef, useState } from "react";
import { minutes, timeLabel } from "./timetable-model.js";
import {
  displayTime,
  parseTimeInput,
  stepTime,
  shiftScheduleDates,
  defaultScheduleTimes,
} from "./schedule-time.js";
function WheelColumn({ label, options, value, onChange }: any) {
  const list = useRef<HTMLDivElement>(null),
    timer = useRef<any>(null),
    latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = Math.max(0, options.indexOf(value)) * 40;
    return () => clearTimeout(timer.current);
  }, []);
  function pick(index: number) {
    const i = Math.max(0, Math.min(options.length - 1, index));
    latest.current(options[i]);
    list.current?.scrollTo({ top: i * 40, behavior: "auto" });
  }
  return (
    <div
      ref={list}
      className="time-wheel-column"
      role="listbox"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => {
        if (["ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          pick(options.indexOf(value) + (e.key === "ArrowUp" ? -1 : 1));
        }
      }}
      onScroll={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (list.current)
            latest.current(
              options[
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    Math.round(list.current.scrollTop / 40),
                  ),
                )
              ],
            );
        }, 80);
      }}
    >
      {options.map((option: any, index: number) => (
        <button
          type="button"
          className="keep-label"
          role="option"
          aria-selected={option === value}
          key={option}
          onClick={() => pick(index)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
function WheelTimeInput({ value, onChange, label, name }: any) {
  const [text, setText] = useState(() => displayTime(value)),
    [invalid, setInvalid] = useState(false),
    [wheel, setWheel] = useState(false),
    root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(displayTime(value));
    setInvalid(false);
  }, [value]);
  useEffect(() => {
    if (!wheel) return;
    const outside = (e: Event) => {
      if (!e.composedPath().includes(root.current!)) closeWheel();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [wheel]);
  function closeWheel() {
    const columns =
      root.current?.querySelectorAll<HTMLElement>(".time-wheel-column");
    if (columns?.length === 3) {
      const period =
          Math.round(columns[0].scrollTop / 40) === 0 ? "오전" : "오후",
        h = Math.max(
          1,
          Math.min(12, Math.round(columns[1].scrollTop / 40) + 1),
        ),
        m =
          Math.max(0, Math.min(11, Math.round(columns[2].scrollTop / 40))) * 5;
      pick(period, h, m);
    }
    setWheel(false);
  }
  function commit() {
    const next = parseTimeInput(text);
    if (next === null) {
      setInvalid(true);
      input.current?.setCustomValidity("시간을 확인하세요");
      return;
    }
    setInvalid(false);
    input.current?.setCustomValidity("");
    onChange(next);
    setText(displayTime(next));
  }
  const count = minutes(value) ?? 9 * 60,
    hour = Math.floor(count / 60) % 24,
    part = hour < 12 ? "오전" : "오후";
  function pick(period: string, h: number, m: number) {
    onChange(timeLabel(((h % 12) + (period === "오후" ? 12 : 0)) * 60 + m));
  }
  return (
    <div className="schedule-time-input" ref={root}>
      {name && <input type="hidden" name={name} value={value || ""} />}
      <input
        ref={input}
        type="text"
        aria-label={label}
        aria-invalid={invalid}
        placeholder="오전 9:00"
        value={text}
        inputMode="text"
        onChange={(e) => {
          setText(e.target.value);
          setInvalid(false);
          input.current?.setCustomValidity("");
        }}
        onBlur={commit}
        onPointerDown={(e) => {
          if (
            window.matchMedia("(pointer:coarse), (max-width:720px)").matches
          ) {
            e.preventDefault();
            setWheel(true);
          }
        }}
        onClick={() => {
          if (window.matchMedia("(pointer:coarse), (max-width:720px)").matches)
            setWheel(true);
        }}
        readOnly={wheel}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            setWheel(false);
          } else if (["ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            const parsed = parseTimeInput(text);
            onChange(
              stepTime(
                parsed === null ? value : parsed,
                e.key === "ArrowUp" ? 5 : -5,
              ),
            );
          } else if (e.key === "Escape") {
            setText(displayTime(value));
            setInvalid(false);
            setWheel(false);
          }
        }}
      />
      {invalid && (
        <small role="alert">오전 9:00 또는 21:00처럼 입력하세요.</small>
      )}
      {wheel && (
        <div
          className="schedule-time-wheel"
          role="group"
          aria-label={label + " 휠 선택"}
        >
          <div className="time-wheel-selection" />
          <WheelColumn
            label="오전/오후"
            options={["오전", "오후"]}
            value={part}
            onChange={(p: string) => pick(p, hour % 12 || 12, count % 60)}
          />
          <WheelColumn
            label="시"
            options={Array.from({ length: 12 }, (_, i) => i + 1)}
            value={hour % 12 || 12}
            onChange={(h: number) => pick(part, h, count % 60)}
          />
          <WheelColumn
            label="분"
            options={Array.from({ length: 12 }, (_, i) =>
              String(i * 5).padStart(2, "0"),
            )}
            value={String((Math.round((count % 60) / 5) * 5) % 60).padStart(
              2,
              "0",
            )}
            onChange={(m: string) => pick(part, hour % 12 || 12, Number(m))}
          />
          <button
            type="button"
            className="keep-label time-wheel-done"
            onClick={closeWheel}
          >
            완료
          </button>
        </div>
      )}
    </div>
  );
}
export function TimeInput({ value, onChange, label, name }: any) {
  function parts(time: string) {
    const n = minutes(time);
    return {
      period: n !== null && n % 1440 >= 720 ? "오후" : "오전",
      hour: n === null ? "" : String(Math.floor(n / 60) % 12 || 12),
      minute: n === null ? "" : String(n % 60).padStart(2, "0"),
    };
  }
  const [fields, setFields] = useState(() => parts(value)),
    draft = useRef(fields),
    emitted = useRef<string | null>(null),
    incoming = useRef(value),
    root = useRef<HTMLDivElement>(null);
  incoming.current = value;
  function edit(key: string, text: string) {
    const next = { ...draft.current, [key]: text };
    draft.current = next;
    setFields(next);
  }
  useEffect(() => {
    if (value !== incoming.current || value === emitted.current) return;
    const next = parts(value);
    draft.current = next;
    setFields(next);
  }, [value]);
  function commit(key?: string, text?: string) {
    if (!key && !draft.current.hour && !draft.current.minute) return;
    const next = { ...draft.current, ...(key ? { [key]: text } : {}) };
    let hour = Number(next.hour || 1),
      minute = Number(next.minute || 0),
      period = String(next.period).toLowerCase();
    period = ["오후", "pm", "p"].includes(period) ? "오후" : "오전";
    if (!Number.isFinite(hour) || hour > 23 || hour < 0) hour = 1;
    if (hour > 12) {
      hour -= 12;
      period = "오후";
    } else if (hour === 0) {
      hour = 12;
      period = "오전";
    }
    minute = Math.max(0, Math.min(59, Number.isFinite(minute) ? minute : 0));
    const normalized = {
      period,
      hour: String(hour),
      minute: String(minute).padStart(2, "0"),
    };
    draft.current = normalized;
    setFields(normalized);
    const time = timeLabel(
      ((hour % 12) + (period === "오후" ? 12 : 0)) * 60 + minute,
    );
    emitted.current = time;
    onChange(time);
  }
  function keys(e: any, key: string) {
    if (e.key === "Tab") {
      const pair = root.current?.closest(".schedule-date-time,.time-fields"),
        inputs = pair?.querySelectorAll<HTMLInputElement>("[data-time-field]");
      if (inputs?.length === 6) {
        e.preventDefault();
        commit();
        const all = [...inputs],
          index = all.indexOf(e.currentTarget),
          next = all[(index + (e.shiftKey ? 5 : 1)) % 6];
        next.focus();
        next.select();
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const sign = e.key === "ArrowUp" ? 1 : -1;
      if (key === "period")
        commit(key, draft.current.period === "오전" ? "오후" : "오전");
      else if (key === "hour")
        commit(
          key,
          String(
            (((Number(draft.current.hour) || 1) - 1 + sign + 12) % 12) + 1,
          ),
        );
      else
        commit(
          key,
          String(((Number(draft.current.minute) || 0) + sign * 5 + 60) % 60),
        );
    }
  }
  return (
    <div className="segmented-time" ref={root}>
      {name && <input type="hidden" name={name} value={value || ""} />}
      <div className="time-segments" role="group" aria-label={label}>
        {[
          ["period", "오전/오후"],
          ["hour", "시"],
          ["minute", "분"],
        ].map(([key, title], i) => (
          <span className="time-segment" key={key}>
            {i === 2 && <span>:</span>}
            <input
              data-time-field={key}
              data-time-period={key === "period" ? "" : undefined}
              aria-label={label + " " + title}
              inputMode={key === "period" ? "text" : "numeric"}
              maxLength={key === "period" ? undefined : 2}
              placeholder={title}
              value={(fields as any)[key]}
              onChange={(e) =>
                edit(
                  key,
                  key === "period"
                    ? e.target.value
                    : e.target.value.replace(/[^0-9]/g, ""),
                )
              }
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => commit()}
              onKeyDown={(e) => keys(e, key)}
            />
          </span>
        ))}
      </div>
      <div className="mobile-time-control">
        <WheelTimeInput value={value} onChange={onChange} label={label} />
      </div>
    </div>
  );
}
export function ScheduleDateTime({ value, onChange, singleDay = false }: any) {
  const allDay = !value.startTime && !value.endTime;
  return (
    <fieldset className="schedule-date-time">
      <legend>
        <label className="member-check">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { ...value, startTime: "", endTime: "" }
                  : { ...value, ...defaultScheduleTimes(value.date) },
              )
            }
          />
          종일
        </label>
      </legend>
      <div className="schedule-date-row">
        <span>시작</span>
        <input
          type="date"
          aria-label={singleDay ? "마감일" : "시작일"}
          name={singleDay ? "due" : "date"}
          required
          value={value.date}
          onChange={(e) =>
            onChange(
              singleDay
                ? { ...value, date: e.target.value, endDate: e.target.value }
                : shiftScheduleDates(value, e.target.value),
            )
          }
        />
        {!allDay && (
          <TimeInput
            name="startTime"
            label="시작 시간"
            value={value.startTime || ""}
            onChange={(startTime: string) => onChange({ ...value, startTime })}
          />
        )}
      </div>
      <div className="schedule-date-row">
        <span>종료</span>
        {singleDay ? (
          <span className="schedule-same-day">같은 날</span>
        ) : (
          <input
            type="date"
            aria-label="종료일"
            name="endDate"
            min={value.date}
            required
            value={value.endDate || value.date}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
          />
        )}{" "}
        {!allDay && (
          <TimeInput
            name="endTime"
            label="종료 시간"
            value={value.endTime || ""}
            onChange={(endTime: string) => onChange({ ...value, endTime })}
          />
        )}
      </div>
      {allDay && (
        <>
          <input type="hidden" name="startTime" value="" />
          <input type="hidden" name="endTime" value="" />
        </>
      )}
    </fieldset>
  );
}
