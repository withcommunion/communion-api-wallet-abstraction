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
      `[32m${info.timestamp}  ${info.level} : ${info.message}
       ${JSON.stringify(info.data)}`
  )
);

const loggerTransports =
  process.env.NODE_ENV === 'test'
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

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.json(),
  transports: loggerTransports,
});

export default logger;
