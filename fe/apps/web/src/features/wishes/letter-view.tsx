"use client";

import type { Draw } from "@couple/domain";
import { useState } from "react";
import { LetterPhoto } from "./letter-photo";

export function LetterView({ snapshot }: { snapshot: Draw["snapshot"] }) {
  const [easyRead, setEasyRead] = useState(false);
  const modern = snapshot.schemaVersion === 2;
  const template = modern ? snapshot.templateId : "cream";
  const photoKey = modern ? snapshot.photoStorageKey : null;
  return (
    <div>
      <button
        type="button"
        className="text-button letter-read-toggle"
        aria-pressed={easyRead}
        onClick={() => setEasyRead((value) => !value)}
      >
        {easyRead ? "Đọc trên giấy thư" : "Chữ dễ đọc"}
      </button>
      <div
        className={`letter-view ${photoKey ? "with-photo" : ""} ${easyRead ? "letter-easy-read" : ""}`}
      >
        <section
          className={`letter-paper letter-paper-read template-${template}`}
        >
          {modern && snapshot.greeting && (
            <p className="letter-greeting">{snapshot.greeting}</p>
          )}
          <p className="letter-body preserve-lines">
            {snapshot.description || "Một điều nhỏ, dành cho nhau."}
          </p>
          {modern && snapshot.closing && (
            <p className="letter-closing">{snapshot.closing}</p>
          )}
          {modern && snapshot.signature && (
            <p className="letter-signature">{snapshot.signature}</p>
          )}
        </section>
        {photoKey && (
          <LetterPhoto
            storageKey={photoKey}
            alt={`Ảnh đi cùng lá thư “${snapshot.title}”`}
          />
        )}
      </div>
    </div>
  );
}
