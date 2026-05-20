/** Shared $expr helpers for WA lead-filter analytics aggregations. */

/** Resolved event time (same rules as wa-dashboard/compute.js `_waEventTs`). */
export function waEventTsExpr() {
  return {
    $let: {
      vars: { et: '$event_timestamp' },
      in: {
        $switch: {
          branches: [
            { case: { $eq: [{ $type: '$$et' }, 'date'] }, then: '$$et' },
            {
              case: { $eq: [{ $type: '$$et' }, 'string'] },
              then: {
                $dateFromString: { dateString: '$$et', onError: '$createdAt', onNull: '$createdAt' },
              },
            },
          ],
          default: {
            $ifNull: [
              '$createdAt',
              { $dateFromString: { dateString: '$timestamp', onError: null, onNull: null } },
            ],
          },
        },
      },
    },
  }
}

/**
 * Date range on resolved event time (not createdAt-only).
 * @returns {object[]}
 */
export function buildWaEventDatePreStages(startDate, endDate) {
  if (!startDate && !endDate) return []
  const f = {}
  if (startDate) f.$gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setDate(end.getDate() + 1)
    f.$lt = end
  }
  return [{ $addFields: { _waEventTs: waEventTsExpr() } }, { $match: { _waEventTs: f } }]
}

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
