import { findElements, startOfDay, createDuration, parseMarker, addDays, addMs } from '@fullcalendar/core'
import { formatIsoDay, formatIsoTime, ensureDate } from '../datelib-utils'
import { parseUtcDate } from '../date-parsing'
import { getBoundingRect } from '../dom-geom'


export default class TimeGridWrapper {

  constructor(private el: HTMLElement) {
  }


  getAllDayEls() {
    return findElements(this.el, '.fc-day[data-date]')
  }


  getDayEls(date) { // TODO: rename
    date = ensureDate(date)
    return findElements(this.el, '.fc-day[data-date="' + formatIsoDay(date) + '"]')
  }


  getSlotEls() { // TODO: rename "slat"
    return findElements(this.el, '.fc-slats tr[data-time]')
  }


  getSlotElByIndex(index) { // TODO: rename "slat"
    return $(`.fc-slats tr:eq(${index})`, this.el).get()
  }


  getSlotElByTime(timeMs) {
    let date = parseUtcDate('2016-01-01')
    date = new Date(date.valueOf() + timeMs)

    if (date.getUTCDate() === 1) { // ensure no time overflow/underflow
      return this.el.querySelector('.fc-slats tr[data-time="' + formatIsoTime(date) + '"]')
    } else {
      return null
    }
  }


  getNonBusinessDayEls() {
    return findElements(this.el, '.fc-nonbusiness')
  }


  queryBgEventsInCol(col) {
    return $(`.fc-content-skeleton td:not(.fc-axis):eq(${col}) .fc-bgevent`, this.el).get()
  }


  queryNonBusinessSegsInCol(col) {
    return $(`.fc-content-skeleton td:not(.fc-axis):eq(${col}) .fc-nonbusiness`, this.el).get()
  }


  // TODO: discourage use
  getDowEls(dayAbbrev) {
    return findElements(this.el, `.fc-day.fc-${dayAbbrev}`)
  }


  // for https://github.com/fullcalendar/fullcalendar-scheduler/issues/363
  isStructureValid() {
    return Boolean(this.el.querySelector('.fc-content-skeleton'))
  }


  getTimeAxisInfo() {
    return $('.fc-slats tr[data-time]', this.el).map(function(i, tr) {
      return {
        text: $(tr).find('.fc-time').text(),
        isMajor: !$(tr).hasClass('fc-minor')
      }
    }).get()
  }


  dragEventToDate(eventEl: HTMLElement, dropDate) {
    return new Promise((resolve) => {
      $(eventEl).simulate('drag', {
        localPoint: { left: '50%', top: 1 }, // 1 for zoom
        end: this.getPoint(dropDate),
        onRelease: () => resolve()
      })
    })
  }


  resizeEvent(eventEl: HTMLElement, newEndDate) {
    return new Promise((resolve) => {
      $(eventEl).simulate('mouseover') // resizer only shows on hover
      $(eventEl).find('.fc-resizer')
        .simulate('drag', {
          end: this.getPoint(newEndDate),
          onRelease: () => resolve()
        })
    })
  }


  selectDates(start, inclusiveEnd) {
    return new Promise((resolve) => {
      $(this.getDayEls(start)).simulate('drag', {
        point: this.getPoint(start),
        end: this.getPoint(inclusiveEnd),
        onRelease: () => resolve()
      })
    })
  }


  clickDate(date) {
    return new Promise((resolve) => {
      $(this.getDayEls(date)).simulate('drag', {
        point: this.getPoint(date),
        onRelease: () => resolve()
      })
    })
  }


  getRect(start, end) {
    var obj
    if (typeof start === 'object') {
      obj = start
      start = obj.start
      end = obj.end
    }

    start = ensureDate(start)
    end = ensureDate(end)

    var startDay = startOfDay(start)
    var endDay = startOfDay(end)
    var startTimeMs = start.valueOf() - startDay.valueOf()
    var endTimeMs = end.valueOf() - endDay.valueOf()

    if (startDay.valueOf() === endDay.valueOf()) {
      endTimeMs = end.valueOf() - endDay.valueOf()
    } else if (end < start) {
      endTimeMs = startTimeMs
    } else {
      endTimeMs = 1000 * 60 * 60 * 24 // whole day
    }

    var dayEls = this.getDayEls(start)
    var dayRect = getBoundingRect(dayEls)
    return {
      left: dayRect.left,
      right: dayRect.right,
      top: this.getTimeTop(startTimeMs),
      bottom: this.getTimeTop(endTimeMs)
    }
  }


  getPoint(date) {
    date = ensureDate(date)

    var day = startOfDay(date)
    var timeMs = date.valueOf() - day.valueOf()
    var top = this.getTimeTop(timeMs)
    var dayEls = this.getDayEls(date)
    var dayRect

    expect(dayEls.length).toBe(1)
    dayRect = getBoundingRect(dayEls[0])

    return {
      left: (dayRect.left + dayRect.right) / 2,
      top: top
    }
  }


  getLine(date) {
    date = ensureDate(date)

    var day = startOfDay(date)
    var timeMs = date.valueOf() - day.valueOf()
    var top = this.getTimeTop(timeMs)
    var dayEls = this.getDayEls(date)
    var dayRect

    expect(dayEls.length).toBe(1)
    dayRect = getBoundingRect(dayEls[0])

    return {
      left: dayRect.left,
      right: dayRect.right,
      top: top,
      bottom: top
    }
  }


  getTimeTop(targetTimeMs) {
    const topBorderWidth = 1 // TODO: kill
    let slotEl = this.getSlotElByTime(targetTimeMs)
    let $slotEl // used within loop, but we access last val

    // exact slot match
    if (slotEl) {
      return $(slotEl).offset().top + topBorderWidth
    }

    let slotEls = this.getSlotEls() // all slots
    let slotTimeMs = null
    let prevSlotTimeMs = null

    for (let i = 0; i < slotEls.length; i++) { // traverse earlier to later
      let slotEl = slotEls[i]
      $slotEl = $(slotEl)

      prevSlotTimeMs = slotTimeMs
      slotTimeMs = createDuration(slotEl.getAttribute('data-time')).milliseconds

      // is target time between start of previous slot but before this one?
      if (targetTimeMs < slotTimeMs) {
        // before first slot
        if (!prevSlotTimeMs) {
          return $slotEl.offset().top + topBorderWidth
        } else {
          let $prevSlotEl = $(slotEls[i - 1])
          return $prevSlotEl.offset().top + // previous slot top
            topBorderWidth +
            ($prevSlotEl.outerHeight() *
            ((targetTimeMs - prevSlotTimeMs) / (slotTimeMs - prevSlotTimeMs)))
        }
      }
    }

    // target time must be after the start time of the last slot.
    // `slotTimeMs` is set to the start time of the last slot.

    // guess the duration of the last slot, based on previous duration
    const slotMsDuration = slotTimeMs - prevSlotTimeMs

    return $slotEl.offset().top + // last slot's top
      topBorderWidth +
      ($slotEl.outerHeight() *
      Math.min(1, (targetTimeMs - slotTimeMs) / slotMsDuration)) // don't go past end of last slot
  }


  computeSpanRects(start, end) {
    start = ensureDate(start)
    end = ensureDate(end)

    var dayStructs = this.computeDayInfo()
    /** @type {any} */
    var slotStructs = this.computeSlotInfo()

    var dayI, dayStruct
    var slotI, slotStruct
    var slotDayStart
    var slotStart
    var slotEnd
    var coverage
    var startTop = null
    var endTop = null
    var rects = []

    for (dayI = 0; dayI < dayStructs.length; dayI++) {
      dayStruct = dayStructs[dayI]

      for (slotI = 0; slotI < slotStructs.length; slotI++) {
        slotStruct = slotStructs[slotI]

        slotDayStart = addDays(
          dayStruct.date,
          slotStruct.dayOffset
        )

        slotStart = addMs(
          slotDayStart,
          slotStruct.startTimeMs
        )

        slotEnd = addMs(
          slotDayStart,
          slotStruct.endTimeMs
        )

        if (startTop === null) { // looking for the start
          coverage = (start - slotStart.valueOf()) / (slotEnd.valueOf() - slotStart.valueOf())
          startTop = (coverage > 0 && coverage <= 1)
            ? (slotStruct.top + slotStruct.height * coverage)
            : null
        } else { // looking for the end
          coverage = (end - slotStart.valueOf()) / (slotEnd.valueOf() - slotStart.valueOf())
          endTop = (coverage >= 0 && coverage < 1) // exclusive
            ? (slotStruct.top + slotStruct.height * coverage)
            : null

          if (endTop !== null) { // found end
            rects.push({
              left: dayStruct.left,
              right: dayStruct.right,
              top: startTop,
              bottom: endTop,
              width: dayStruct.right - dayStruct.left,
              height: endTop - startTop
            })
            startTop = null
          }
        }
      }

      if (startTop !== null) { // could not find the start in this day
        rects.push({
          left: dayStruct.left,
          right: dayStruct.right,
          top: startTop,
          bottom: slotStruct.bottom,
          width: dayStruct.right - dayStruct.left,
          height: slotStruct.bottom - startTop
        })
        startTop = slotStructs[0].top // top of next column
      }
    }

    return rects
  }

  private computeDayInfo() {
    var dayEls = this.getAllDayEls()

    var days = dayEls.map(function(node) {
      var rect = node.getBoundingClientRect()
      return $.extend({}, rect, {
        date: parseMarker(
          node.getAttribute('data-date')
        ).marker
      })
    })

    return days
  }

  private computeSlotInfo() {
    var slotEls = this.getSlotEls()

    /** @type {any} */
    var slots
    slots = slotEls.map(function(node) {
      var rect = node.getBoundingClientRect()
      return $.extend({}, rect, {
        startTimeMs: createDuration(
          node.getAttribute('data-time')
        ).milliseconds
      })
    })

    var len = slots.length
    if (len < 3) {
      console.log('need at least 3 slots')
      return []
    }

    var mid = Math.floor(len / 2)
    var i = mid - 1
    var standardMs = slots[mid + 1].startTimeMs - slots[mid].startTimeMs
    var ms
    var dayOffset = 0

    // iterate from one-before middle to beginning
    for (i = mid - 1; i >= 0; i--) {
      ms = slots[i + 1].startTimeMs - slots[i].startTimeMs

      // big deviation? assume moved to previous day (b/c of special minTime)
      if (Math.abs(ms - standardMs) > standardMs * 2) {
        dayOffset--
        slots[i].endTimeMs = slots[i].startTimeMs + standardMs
      } else { // otherwise, current slot's end is next slot's beginning
        slots[i].endTimeMs = slots[i + 1].startTimeMs
      }

      slots[i].dayOffset = dayOffset
    }

    dayOffset = 0

    // iterate from middle to one-before last
    for (i = mid; i < len - 1; i++) {
      ms = slots[i + 1].startTimeMs - slots[i].startTimeMs

      slots[i].dayOffset = dayOffset

      // big deviation? assume moved to next day (b/c of special maxTime)
      if (Math.abs(ms - standardMs) > standardMs * 2) {
        dayOffset++ // will apply to the next slotStruct
        slots[i].endTimeMs = slots[i].startTimeMs + standardMs
      } else { // otherwise, current slot's end is next slot's beginning
        slots[i].endTimeMs = slots[i + 1].startTimeMs
      }
    }

    // assume last slot has the standard duration
    slots[i].endTimeMs = slots[i].startTimeMs + standardMs
    slots[i].dayOffset = dayOffset

    // if last slot went over the day threshold
    if (slots[i].endTimeMs > 1000 * 60 * 60 * 24) {
      slots[i].endTimeMs -= 1000 * 60 * 60 * 24
      slots[i].dayOffset++
    }

    return slots
  }

}