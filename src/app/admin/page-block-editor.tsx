"use client";

import { useState } from "react";

type Block = { type: string; props?: Record<string, unknown>; hidden?: boolean; [key: string]: unknown };
const types = [
  ["hero", "Hero"],
  ["doctor-profile", "Doctor introduction"],
  ["services", "Services"],
  ["testimonials", "Patient stories"],
  ["faq", "Frequently asked questions"],
  ["cta", "Appointment request"],
] as const;
const defaultTitle: Record<string, string> = Object.fromEntries(types);

export function PageBlockEditor({ initialBlocks }: { initialBlocks: Block[] }) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks.filter((item) => item && typeof item.type === "string"));
  const [newType, setNewType] = useState("");

  function update(index: number, transform: (block: Block) => Block) {
    setBlocks((current) => current.map((block, i) => i === index ? transform(block) : block));
  }

  function move(index: number, offset: number) {
    setBlocks((current) => {
      const next = [...current];
      const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return <fieldset className="block-builder field-wide">
    <legend>Homepage sections</legend>
    <p>Reorder sections, change their headings, hide a section temporarily, or duplicate and remove it.</p>
    <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
    <div className="page-block-list">{blocks.map((block, index) => <article className={`page-block-item${block.hidden ? " is-hidden" : ""}`} key={`${block.type}-${index}`}>
      <div className="page-block-controls"><span className="page-block-number">{String(index + 1).padStart(2, "0")}</span><strong>{types.find(([type]) => type === block.type)?.[1] ?? block.type}</strong><div className="page-block-buttons">
        <button type="button" className="text-button" aria-label={`Move ${block.type} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className="text-button" aria-label={`Move ${block.type} down`} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="text-button" onClick={() => update(index, (item) => ({ ...item, hidden: !item.hidden }))}>{block.hidden ? "Show" : "Hide"}</button>
        <button type="button" className="text-button" onClick={() => setBlocks((current) => [...current.slice(0, index + 1), JSON.parse(JSON.stringify(block)) as Block, ...current.slice(index + 1)])}>Duplicate</button>
        <button type="button" className="text-button text-danger" onClick={() => setBlocks((current) => current.filter((_, i) => i !== index))}>Remove</button>
      </div></div>
      {block.type === "hero" ? <p className="page-block-note">Edit the hero eyebrow and headline in the Hero section above.</p> : <label className="field"><span>Section heading</span><input value={typeof block.props?.title === "string" ? block.props.title : defaultTitle[block.type] ?? ""} onChange={(event) => update(index, (item) => ({ ...item, props: { ...item.props, title: event.target.value } }))} /></label>}
    </article>)}</div>
    <div className="add-block-row"><label className="field"><span>Add section</span><select value={newType} onChange={(event) => setNewType(event.target.value)}><option value="">Choose a section</option>{types.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      <button type="button" className="button button-small" disabled={!newType} onClick={() => { if (newType) { setBlocks((current) => [...current, { type: newType, props: { title: defaultTitle[newType] ?? "New section" } }]); setNewType(""); } }}>Add section</button>
    </div>
  </fieldset>;
}
