import winston, { format, transports } from 'winston';

const alignColorsAndTime = winston.format.combine(
  winston.format.colorize({
    all: true,
  }),
  winston.format.label({
    label: '[LOGGER]',
  }),
  winston.format.timestamp({
    format: 'YY-MM-DD HH:mm:ss',
  }),
  winston.format.printf(
    (info) =>
      // eslint-disable-next-line
      `[32m${info.timestamp} |  ${info.level} | ${info.message} | ${
        // eslint-disable-next-line
        info._requestId
      }
       ${JSON.stringify(info.values)}`
  )
);

const loggerTransports =
  process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'local'
    ? [
        new transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            alignColorsAndTime
          ),
        }),
      ]
    : [
        new transports.Console({
          format: winston.format.combine(
            // eslint-disable-next-line
            format.printf((info) => `[${info.label}] ${info.message}`),
            format.json()
          ),
        }),
      ];

console.log('-------------');
console.log(process.env.LOG_LEVEL);
console.log('-------------');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.json(),
  transports: loggerTransports,
});

export default logger;
