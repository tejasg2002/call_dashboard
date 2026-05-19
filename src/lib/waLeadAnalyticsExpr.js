/** Shared $expr helpers for WA lead-filter analytics aggregations. */

export function waMessageStatusExpr() {
  return { $ifNull: ['$message_status', '$data.message.message_status'] }
}

export function waStageExpr() {
  return {
    $let: {
      vars: {
        et: { $toLower: { $ifNull: ['$type', { $ifNull: ['$event_type', ''] }] } },
        ms: { $toLower: waMessageStatusExpr() },
      },
      in: {
        $switch: {
          branches: [
            { case: { $regexMatch: { input: '$$et', regex: 'click' } }, then: 'clicked' },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'read' } }, { $eq: ['$$ms', 'read'] }],
              },
              then: 'read',
            },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'deliver' } }, { $eq: ['$$ms', 'delivered'] }],
              },
              then: 'delivered',
            },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'sent' } }, { $eq: ['$$ms', 'sent'] }],
              },
              then: 'sent',
            },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'fail' } }, { $eq: ['$$ms', 'failed'] }],
              },
              then: 'failed',
            },
          ],
          default: null,
        },
      },
    },
  }
}
