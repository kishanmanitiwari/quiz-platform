"use client";

const key = "iskcon_quiz_session_id";

export function getSessionId() {
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export function participantKey(roomCode: string) {
  return `iskcon_quiz_participant_${roomCode.toUpperCase()}`;
}
