import {sortMembers,reorderMembers} from './member-sort.js';
import {MemberSort} from './MemberSort';
import {memberLabel,assigneeLabel} from './people-model.js';
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { Member } from "./data";
export function AssigneePicker({
  members,
  value,
  defaultValue = "미지정",
  name,
  onChange,
  onAdd,
  allowAdd=true,
}: {
  members: Member[];
  value?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (name: string) => void;
  onAdd: (name: string) => void;
  allowAdd?: boolean;
}) {
  const [selected, setSelected] = useState(defaultValue),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const [sort,setSort]=useState('name'),[customOrder,setCustomOrder]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('pn-assignee-order')||'[]')}catch{return []}});
  const current = value ?? selected;
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const term = query.trim().toLocaleLowerCase();
  const results = sortMembers(members,sort,customOrder).filter(m=>!term||[memberLabel(m),m.contact,m.email].filter(Boolean).join(' ').toLocaleLowerCase().includes(term));
  const options = [
    ...results.map((m) => ({ key: m.id, name: m.name, add: false })),
    ...(!term ? [{ key: "unassigned", name: "미지정", add: false }] : []),
  ];
  if (
    allowAdd && term &&
    query.trim() !== "미지정" &&
    !members.some((m) => m.name.toLocaleLowerCase() === term)
  )
    options.push({ key: "add", name: query.trim(), add: true });
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!e.composedPath().includes(root.current!)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  function choose(option: (typeof options)[number]) {
    if (option.add) onAdd(option.name);
    setSelected(option.name);
    onChange?.(option.name);
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      ref={root}
      className="assignee-picker"
      onBlur={()=>requestAnimationFrame(()=>{const focused=(root.current?.getRootNode() as Document|ShadowRoot)?.activeElement;if(!root.current?.contains(focused))setOpen(false)})}

    >
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        ref={trigger}
        className="assignee-trigger"
        aria-label="담당자 선택"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen(previous=>!previous);
          setQuery("");
          setActive(0);
        }}
      >
        {assigneeLabel(members,current)}
        <ChevronDown size={12} style={{pointerEvents:"none",transform:open?"rotate(180deg)":undefined}} />
      </button>
      {open && (
        <div className="assignee-popover">
          <div className="assignee-search">
            <Plus size={14} />
            <input
              ref={input}
              role="combobox"
              aria-label="담당자 검색"
              aria-expanded="true"
              aria-controls={id}
              aria-autocomplete="list"
              aria-activedescendant={
                options[active] ? `${id}-${active}` : undefined
              }
              value={query}
              maxLength={80}
              placeholder="검색"
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  trigger.current?.focus();
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (options.length)
                    setActive(
                      (i) =>
                        (i +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          options.length) %
                        options.length,
                    );
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[active]) choose(options[active]);
                }
              }}
            />
          </div>
          <MemberSort value={sort} onChange={v=>{setSort(v);setActive(0)}}/><div className="assignee-caption">
            담당자
          </div>
          <div id={id} role="listbox" aria-label="담당자 명단">
            {options.map((o, i) => (
              <button
                type="button"
                key={o.key}
                id={`${id}-${i}`}
                role="option" draggable={sort==='custom'&&!o.add&&o.key!=='unassigned'} onDragStart={e=>{e.dataTransfer.setData('application/x-assignee',o.key);e.dataTransfer.effectAllowed='move'}} onDragOver={e=>{if(sort==='custom'&&e.dataTransfer.types.includes('application/x-assignee'))e.preventDefault()}} onDrop={e=>{e.preventDefault();const key=e.dataTransfer.getData('application/x-assignee');if(!members.some(m=>m.id===key)||!members.some(m=>m.id===o.key))return;const order=reorderMembers(sortMembers(members,'custom',customOrder).map(m=>m.id),key,o.key,e.clientY>e.currentTarget.getBoundingClientRect().top+e.currentTarget.getBoundingClientRect().height/2);setCustomOrder(order);localStorage.setItem('pn-assignee-order',JSON.stringify(order))}}
                aria-selected={current === o.name && !o.add}
                className={active === i ? "highlighted" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                {o.add ? (
                  <>
                    <Plus size={13} />
                    <span>“{o.name}” 명단에 추가</span>
                  </>
                ) : (
                  <>
                    <span className="avatar">
                      {o.name === "미지정" ? "—" : o.name.slice(-2)}
                    </span>
                    <span>{assigneeLabel(members,o.name)}</span>
                    {current === o.name && <Check size={13} />}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

