'use strict';
const { Bot } = require('./bot');
const { Database } = require('./database');
const { Context } = require('./context');
const { BotError, ParseError, ValidationError } = require('./errors');
const { parse } = require('./parser');
const { createRegistry, CATEGORIES } = require('./functions');

module.exports = {
  Bot,
  Database,
  Context,
  BotError,
  ParseError,
  ValidationError,
  parse,
  createRegistry,
  CATEGORIES,
};
