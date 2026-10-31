'use strict';

/** Error umum milik package ini. */
class BotError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EasyDCError';
  }
}

/** Error saat membaca kode `$fungsi[...]` (ada posisi baris/kolom). */
class ParseError extends BotError {
  constructor(message, { line, col } = {}) {
    super(line ? `${message} (baris ${line}, kolom ${col})` : message);
    this.name = 'EasyDCParseError';
    this.line = line;
    this.col = col;
  }
}

/** Dikumpulkan dari semua command yang kodenya salah (dilempar sebelum bot login). */
class ValidationError extends BotError {
  constructor(problems) {
    super(`Ditemukan ${problems.length} masalah pada kode:\n - ${problems.join('\n - ')}`);
    this.name = 'EasyDCValidationError';
    this.problems = problems;
  }
}

/** Sinyal internal untuk menghentikan eksekusi ($stop, $onlyIf, $cooldown, ...). */
class Stop extends Error {
  constructor(message = '') {
    super(message);
    this.name = 'EasyDCStop';
  }
}

module.exports = { BotError, ParseError, ValidationError, Stop };
