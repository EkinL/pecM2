/* eslint-disable @typescript-eslint/no-require-imports */
const { createLogger, format, transports } = require('winston');

const logger = () =>
  createLogger({
    transports: [
      new transports.Console({
        handleExceptions: true,
        format: format.json(),
      }),
    ],
  });

module.exports = { logger };
