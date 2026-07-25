/* app/admin/RoomModal/AutoReadModal.tsx */
'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import type { RoomDetail, RoomForm } from './types'

export type AutoReadCandidate = {
  room: Partial<RoomForm>
  detail: Partial<RoomDetail>
  warnings: string[]
  sourceText: string
}

export type AutoReadResult = {
  candidates: AutoReadCandidate[]
  sharedRoom: Partial<RoomForm>
  sharedDetail: Partial<RoomDetail>
  warnings: string[]
}

type Props = {
  open: boolean
  onClose: () => void
  onApply: (candidate: AutoReadCandidate, shared: {
    room: Partial<RoomForm>
    detail: Partial<RoomDetail>
  }) => void
}

const money = (raw?: string | null): number => {
  if (!raw) return 0

  let s = stripAccent(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .toLowerCase()

  // free
  if (
    /^(free|mienphi|miễnphí|0)$/i.test(s) ||
    /(free|mienphi|miễnphí)/i.test(s)
  ) {
    return 0
  }

  // ==========================
  // 3m2 -> 3.200.000
  // 3m25 -> 3.250.000
  // ==========================
  let m = s.match(/^(\d+)m(\d{1,3})$/)
  if (m) {
    const whole = Number(m[1])

    let tail = 0

    if (m[2].length === 1) tail = Number(m[2]) * 100000
    else if (m[2].length === 2) tail = Number(m[2]) * 10000
    else tail = Number(m[2]) * 1000

    return whole * 1000000 + tail
  }

  // ==========================
  // 3tr5
  // 3tr50
  // 3tr500
  // ==========================

  m = s.match(/^(\d+)(?:tr|trieu|triệu)(\d{1,3})$/)

  if (m) {
    const whole = Number(m[1])

    let tail = 0

    if (m[2].length === 1)
      tail = Number(m[2]) * 100000

    else if (m[2].length === 2)
      tail = Number(m[2]) * 10000

    else
      tail = Number(m[2]) * 1000

    return whole * 1000000 + tail
  }

  // ==========================
  // 3 triệu 5
  // 3 triệu500
  // ==========================

  m = stripAccent(raw).match(
    /(\d+)\s*trieu\s*(\d{1,3})/
  )

  if (m) {
    const whole = Number(m[1])

    let tail = 0

    if (m[2].length === 1)
      tail = Number(m[2]) * 100000

    else if (m[2].length === 2)
      tail = Number(m[2]) * 10000

    else
      tail = Number(m[2]) * 1000

    return whole * 1000000 + tail
  }

  // ==========================
  // 3.2tr
  // 3,2tr
  // ==========================

  m = s.match(/^(\d+)(?:\.([0-9]+))?(?:tr|trieu|triệu)$/)

  if (m) {
    return Math.round(
      parseFloat(`${m[1]}.${m[2] || 0}`) * 1000000
    )
  }

  // ==========================
  // 3500k
  // ==========================

  m = s.match(/^(\d{4,5})k$/)

  if (m) {
    return Number(m[1]) * 1000
  }

  // ==========================
  // 4k5
  // 3k8
  // ==========================

  m = s.match(/^(\d+)k(\d)$/)

  if (m) {
    return Number(m[1]) * 1000 + Number(m[2]) * 100
  }

  // ==========================
  // 4k50
  // ==========================

  m = s.match(/^(\d+)k(\d{2})$/)

  if (m) {
    return Number(m[1]) * 1000 + Number(m[2]) * 10
  }

  // ==========================
  // 4.5k
  // 4,5k
  // ==========================

  m = s.match(/^(\d+(?:\.\d+)?)k(?:wh)?$/)

  if (m) {
    return Math.round(parseFloat(m[1]) * 1000)
  }

  // ==========================
  // 3 triệu
  // 3tr
  // ==========================

  m = s.match(/^(\d+)(?:tr|trieu|triệu)$/)

  if (m) {
    return Number(m[1]) * 1000000
  }

  // ==========================
  // 100k
  // ==========================

  m = s.match(/^(\d+)k$/)

  if (m) {
    return Number(m[1]) * 1000
  }

  // ==========================
  // 3.500.000
  // ==========================

  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
    return Number(s.replace(/\./g, ''))
  }

  // ==========================
  // chỉ còn số
  // ==========================

  const digits = s.replace(/[^\d]/g, '')

  if (!digits) return 0

  return Number(digits)
}

const normalizeText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

const stripAccent = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

const firstMatch = (text: string, regexes: RegExp[]) => {
  for (const re of regexes) {
    const m = text.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

const extractPhone = (text:string) => {

  const match = text.match(
    /(?:\+?84|0)[\d\s.()-]{8,15}\d/g
  )

  if (!match) return ''

  return match[0]
    .replace(/[^\d]/g,'')
    .replace(/^84/,'0')
}
const extractContactPhone = (text:string)=>{

  const lines = text.split('\n')

  for(const line of lines){

    const s = stripAccent(line)

    if(
      /dan khach|lien he|sdt|so dt|dien thoai|phone|zalo/.test(s)
    ){

      const phone = line.match(
        /(?:\+?84|0)[\d\s.()-]{8,15}\d/
      )

      if(phone){

        return phone[0]
          .replace(/[^\d]/g,'')
          .replace(/^84/,'0')
      }
    }
  }

  return extractPhone(text)
}

const allMatches = (
  text: string,
  regexes: RegExp[]
): string[] => {
  const result: string[] = []

  for (const regex of regexes) {
    const re = new RegExp(
      regex.source,
      regex.flags.includes('g')
        ? regex.flags
        : regex.flags + 'g'
    )

    let m: RegExpExecArray | null

    while ((m = re.exec(text))) {
      if (m[1]) {
        const value = m[1].trim()

        if (
          value &&
          !result.includes(value)
        ) {
          result.push(value)
        }
      }
    }
  }

  return result
}

const firstNonEmpty = (
  ...values: Array<string | undefined | null>
) => {
  for (const v of values) {
    if (v && v.trim()) return v.trim()
  }

  return ''
}

const mergeUniqueLines = (
  lines: string[]
) => {
  return Array.from(
    new Set(
      lines
        .map(x => x.trim())
        .filter(Boolean)
    )
  ).join('\n')
}

const containsKeyword = (
  text: string,
  keywords: string[]
) => {
  const s = stripAccent(text)

  return keywords.some(keyword =>
    s.includes(stripAccent(keyword))
  )
}

const normalizeSpaces = (s: string) =>
  s
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

type ParsedLine = {
  index: number
  raw: string
  normalized: string
}

type ParseContext = {
  lines: ParsedLine[]
  usedRanges: Map<number, Array<{ start: number; end: number; field: string }>>
}

const createParseContext = (text: string): ParseContext => ({
  lines: text
    .split('\n')
    .map((raw, index) => ({
      index,
      raw: raw.trim(),
      normalized: stripAccent(raw.trim()),
    }))
    .filter(line => line.raw.length > 0),
  usedRanges: new Map(),
})

const overlapsUsedRange = (
  context: ParseContext,
  lineIndex: number,
  start: number,
  end: number
) => {
  const ranges = context.usedRanges.get(lineIndex) || []
  return ranges.some(range => start < range.end && end > range.start)
}

const consumeRange = (
  context: ParseContext,
  lineIndex: number,
  start: number,
  end: number,
  field: string
) => {
  if (overlapsUsedRange(context, lineIndex, start, end)) return false

  const ranges = context.usedRanges.get(lineIndex) || []
  ranges.push({ start, end, field })
  context.usedRanges.set(lineIndex, ranges)
  return true
}

const ADDRESS_DISTRICTS =
'(?:q\\.?\\s*\\d{1,2}|quận\\s*\\d{1,2}|tp\\.?\\s*thu\\s*duc|thủ\\s*đức|binh\\s*thanh|bình\\s*thạnh|phu\\s*nhuan|phú\\s*nhuận|tan\\s*binh|tân\\s*bình|go\\s*vap|gò\\s*vấp|binh\\s*tan|bình\\s*tân|tan\\s*phu|tân\\s*phú|nha\\s*be|nhà\\s*bè|hoc\\s*mon|hóc\\s*môn|cu\\s*chi|củ\\s*chi|binh\\s*chanh|bình\\s*chánh|can\\s*gio|cần\\s*giờ)'

const findAddressSegment = (raw: string) => {
  const labeled = raw.match(
    /(?:địa\s*chỉ|dia\s*chi|dc)\s*[:\-]\s*(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)*\s+.+)$/i
  )

  if (labeled?.[1]) {
    return {
      value: labeled[1].trim(),
      start: raw.indexOf(labeled[1]),
    }
  }

  // Hỗ trợ địa chỉ nằm trong tiêu đề:
  // "... - 958/13/12 LẠC LONG QUÂN - TÂN BÌNH"
 const embedded = raw.match(
  new RegExp(
  `(\\d+[A-Za-z]?(?:\\/\\d+[A-Za-z]?)*(?:\\/[A-Za-z0-9]+)?\\s+[^\\n]{4,}?(?:${ADDRESS_DISTRICTS})?)$`,
  'i'
  )
  )
  if (!embedded?.[1]) return null

  return {
    value: embedded[1].trim(),
    start: raw.indexOf(embedded[1]),
  }
}

const isAddressLine = (line: ParsedLine) =>
  Boolean(findAddressSegment(line.raw))

function parseAddress(
  context: ParseContext
): Partial<RoomForm> {
  const line = context.lines.find(isAddressLine)
  if (!line) return {}

  const segment = findAddressSegment(line.raw)
  if (!segment) return {}

  consumeRange(
    context,
    line.index,
    segment.start,
    segment.start + segment.value.length,
    'address'
  )

  const clean = segment.value
    .replace(/^[📍🏠📌]\s*/, '')
    .trim()

  const houseMatch = clean.match(
    /^(\d+[A-Za-z]?(?:\/[A-Za-z0-9]+)*)\s+(.+)$/i
  )

  const house_number = houseMatch?.[1] || ''
  let rest = houseMatch?.[2] || clean

  rest = rest
    .replace(/\bPRO\b\.?/ig, '')
    .replace(/\bKDC\b/ig, 'KDC ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const district = firstMatch(rest, [
    new RegExp(`(${ADDRESS_DISTRICTS})`, 'i'),
  ])

  const ward = firstMatch(rest, [
    /(?:phường|p\.?)\s*([0-9]{1,2}|[a-zà-ỹ\s]+?)(?=,|\-|$)/i,
  ])

  // bỏ phường/quận khỏi địa chỉ
  rest = rest
    .replace(/(?:phường|p\.?)\s*[a-zà-ỹ0-9\s]+(?=,|\-|$)/i, '')
    .replace(new RegExp(ADDRESS_DISTRICTS, 'ig'), '')
    .replace(/^[,\-\s]+/, '')
    .replace(/[,\-\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Chuẩn hóa Quận
  let districtValue = ''

  if (district) {
    districtValue = district.trim()

    districtValue = districtValue.replace(
      /^q\.?\s*(\d+)/i,
      'Quận $1'
    )

    districtValue = districtValue.replace(
      /^quận\s*(\d+)/i,
      'Quận $1'
    )

    districtValue = districtValue
    .trim()
    .replace(/^./, c => c.toUpperCase())
  }

  return {
    house_number,
    address: rest,
    ward: ward.trim(),
    district: districtValue,
  }
}

function inferRoomType(text: string) {
  const s = stripAccent(text)

  if (/\bduplex\b/.test(s)) return 'Duplex'
  if (/\bstudio\b/.test(s)) return 'Studio'
  if (/\b1\s*pn\b|\b1\s*phong ngu\b/.test(s)) return '1PN'
  if (/\b2\s*pn\b|\b2\s*phong ngu\b/.test(s)) return '2PN'
  if (/\b3\s*pn\b|\b3\s*phong ngu\b/.test(s)) return '3PN'
  if (/\bcan ho\b/.test(s)) return 'Căn hộ'
  if (/\bphong tro\b/.test(s)) return 'Phòng trọ'

  return ''
}

const parseExplicitPrice = (
  line: string,
  excludedStart = -1,
  excludedEnd = -1
) => {
  const patterns = [
    /\b\d+\s*(?:tr|triệu|trieu)\s*\d{1,3}\b/i,
    /\b\d+(?:[.,]\d+)?\s*(?:tr|triệu|trieu)\b/i,
    /\b\d{1,3}(?:[.,]\d{3}){2,}\b/,
    /\b\d{7,10}\b/,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(line)
    if (!match || match.index == null) continue

    const start = match.index
    const end = start + match[0].length

    if (
      excludedStart >= 0 &&
      start < excludedEnd &&
      end > excludedStart
    ) {
      continue
    }

    return {
      raw: match[0],
      value: money(match[0]),
      start,
      end,
    }
  }

  return null
}

function extractRoomMarkers(context: ParseContext) {
  const markers: Array<{
    code: string
    price: number
    line: string
    roomType: string
    status: RoomForm['status']
  }> = []

  const seen = new Set<string>()

  for (const line of context.lines) {
    if (isAddressLine(line)) continue

    const normalized = line.normalized

    const hasRoomCue =
      /\b(?:phong|phòng|studio|duplex|can ho|căn hộ|ch|room)\b/i.test(
        normalized
      )

    const hasAvailabilityCue =
      /\b(?:trong san|trống sẵn|trong|trống|available|da thue|đã thuê)\b/i.test(
        normalized
      )

    if (!hasRoomCue && !hasAvailabilityCue) continue

    const codePatterns = [
      /(?:mã\s*phòng|ma\s*phong|phòng|phong|room|studio|duplex|ch|căn\s*hộ|can\s*ho)\s*[:#\-]?\s*([A-Z]?\d{2,4}|trệt|tret|lửng|lung)\b/i,
      /^\s*([A-Z]\d{2,4})\b/i,
    ]

    let codeMatch: RegExpExecArray | null = null

    for (const pattern of codePatterns) {
      codeMatch = pattern.exec(line.raw)
      if (codeMatch) break
    }

    if (!codeMatch || codeMatch.index == null || !codeMatch[1]) continue

    const codeRaw = String(codeMatch[1]).trim().toUpperCase()
    const codeStart =
      codeMatch.index + codeMatch[0].lastIndexOf(codeMatch[1])
    const codeEnd = codeStart + codeMatch[1].length

    if (
      overlapsUsedRange(
        context,
        line.index,
        codeStart,
        codeEnd
      )
    ) {
      continue
    }

    const price = parseExplicitPrice(
      line.raw,
      codeStart,
      codeEnd
    )

    if (!price || price.value <= 0) continue

    if (
      overlapsUsedRange(
        context,
        line.index,
        price.start,
        price.end
      )
    ) {
      continue
    }

    consumeRange(
      context,
      line.index,
      codeStart,
      codeEnd,
      'room_code'
    )

    consumeRange(
      context,
      line.index,
      price.start,
      price.end,
      'price'
    )

    const key = `${codeRaw}|${price.value}`
    if (seen.has(key)) continue
    seen.add(key)

    markers.push({
      code: codeRaw,
      price: price.value,
      line: line.raw,
      roomType: inferRoomType(line.raw),
      status:
      /sap\s*trong|sắp\s*trống|sap\s*co\s*phong|sắp\s*có\s*phòng/i.test(normalized)
        ? 'Sắp trống'
        : /da\s*thue|đã\s*thuê/i.test(normalized)
          ? 'Đã thuê'
          : 'Đang trống',
    })
  }

  if (markers.length > 0) return markers

  for (const line of context.lines) {
    if (isAddressLine(line)) continue

    const labeledCode = /(?:mã\s*phòng|ma\s*phong|phòng|phong)\s*[:\-]\s*([A-ZÀ-Ỹ0-9\-]+)/i.exec(
      line.raw
    )

    if (!labeledCode || labeledCode.index == null) continue

    const codeRaw = String(labeledCode[1] || '')
      .trim()
      .toUpperCase()

    const codeStart =
      labeledCode.index +
      labeledCode[0].lastIndexOf(labeledCode[1])

    const codeEnd = codeStart + labeledCode[1].length
    const price = parseExplicitPrice(line.raw, codeStart, codeEnd)

    if (!price || !codeRaw) continue

    consumeRange(
      context,
      line.index,
      codeStart,
      codeEnd,
      'room_code'
    )

    consumeRange(
      context,
      line.index,
      price.start,
      price.end,
      'price'
    )

    markers.push({
      code: codeRaw,
      price: price.value,
      line: line.raw,
      roomType: inferRoomType(line.raw),
      status:
      /sap\s*trong|sắp\s*trống|sap\s*co\s*phong|sắp\s*có\s*phòng/i.test(line.normalized)
        ? 'Sắp trống'
        : /da\s*thue|đã\s*thuê/i.test(line.normalized)
          ? 'Đã thuê'
          : 'Đang trống',
    })
  }

  return markers
}

function parseFees(text: string): Partial<RoomDetail> {
  const lines = text
    .split('\n')
    .map(x => normalizeSpaces(x))
    .filter(Boolean)

  let electric = 0
  let water = 0
  let service = 0

  let parking = 0

  let electricUnit = 'kWh'
  let waterUnit = 'phòng/tháng'
  let serviceUnit = 'phòng/tháng'
  let parkingUnit = 'chiếc'

  const otherNotes: string[] = []

  for (const line of lines) {
    const s = stripAccent(line)

    // =====================
    // ĐIỆN
    // =====================

    if (
      containsKeyword(s, [
        'điện',
        'dien',
        'electric'
      ])
    ) {
      if (
        /evn|nha nuoc|gia dan/.test(s)
      ) {
        otherNotes.push(line)
        continue
      }

      const m = line.match(
        /(\d+(?:[.,]\d+)?\s*k(?:wh)?)/i
      )

      if (m) {
        electric = money(m[1])
      }

      continue
    }

    // =====================
    // NƯỚC
    // =====================

    if (
      containsKeyword(s, [
        'nước',
        'nuoc',
        'nc'
      ])
    ) {
      const m = line.match(
        /(\d+(?:[.,]\d+)?\s*(?:k|tr|triệu)?)/i
      )

      if (m)
        water = money(m[1])

      if (
        /nguoi|người/.test(s)
      )
        waterUnit = 'người/tháng'

      else
      if (
        /phong|phòng/.test(s)
      )
        waterUnit = 'phòng/tháng'

      continue
    }

    // =====================
    // DỊCH VỤ
    // =====================

    if (
      containsKeyword(s, [
        'dịch vụ',
        'dv',
        'phi dv',
        'phi qly',
        'pql',
        'phi quan ly',
        'quan ly',
        'quanly',
        'pql'
      ])
    ) {
      const prices =
        line.match(
          /\d+(?:[.,]\d+)?\s*(?:k|tr|triệu)?/gi
        ) || []

      if (prices.length) {
        service = Math.max(
          ...prices.map(money)
        )
      }

      if (
        /nguoi|người/.test(s)
      )
        serviceUnit = 'người/tháng'

      else
        serviceUnit = 'phòng/tháng'

      continue
    }

    // =====================
    // XE
    // =====================

    if (
      containsKeyword(s, [
        'xe',
        'giu xe',
        'gui xe',
        'parking'
      ])
    ) {
      if (
        /free|mien phi|miễn phí/.test(s)
      ) {
        parking = 0
        parkingUnit = 'Miễn phí'
      }

      const prices =
        line.match(
          /\d+(?:[.,]\d+)?\s*(?:k|tr|triệu)?/gi
        ) || []

      if (prices.length) {
        parking = Math.max(
          parking,
          ...prices.map(money)
        )

        parkingUnit = 'chiếc/tháng'
      }

      otherNotes.push(line)

      continue
    }
  }

  return {
    electric_fee_value: electric,
    electric_fee_unit: electricUnit,

    water_fee_value: water,
    water_fee_unit: waterUnit,

    service_fee_value: service,
    service_fee_unit: serviceUnit,

    parking_fee_value: parking,
    parking_fee_unit: parkingUnit,

    other_fee_value: 0,
    other_fee_note: mergeUniqueLines(otherNotes),
  }
}

function parseAmenities(text: string): Partial<RoomDetail> {
  const s = stripAccent(text)

  const petLine = firstMatch(text, [
    /(?:thú\s*cưng|thu\s*cung|pet)\s*[:\-]?\s*([^\n]+)/i,
  ])
  const normalizedPetLine = stripAccent(petLine)

  const noPet =
    /\b(?:thú\s*cưng|thu\s*cung|pet)\s*[:\-]?\s*(?:không|khong|ko|k|no)\b/i.test(text) ||
    /\bkhong\s*(?:cho\s*)?(?:nuoi\s*)?(?:pet|cho|meo|thu cung)\b/.test(s) ||
    /\bno\s*pet\b/.test(s) ||
    /^(?:khong|ko|k|no)\b/.test(normalizedPetLine)

  const allowCat =
    !noPet &&
    (
      /\b(?:cho\s*)?(?:nuoi\s*)?meo\b/.test(s) ||
      /\bmeo\b/.test(normalizedPetLine)
    )

  const allowDog =
    !noPet &&
    (
      /\b(?:cho\s*)?(?:nuoi\s*)?cho\b/.test(s) ||
      /\bcho\b/.test(normalizedPetLine)
    )

  const allowPet =
    !noPet &&
    (
    allowCat ||
    allowDog ||

    /\bpet\b/.test(s) ||

    /\bthu cung\b/.test(s) ||

    /\bcho nuoi\b/.test(s) ||

    /\bduoc nuoi\b/.test(s) ||

    /\bnhan pet\b/.test(s) ||

    /\bco pet\b/.test(s)
    )

  return {
    has_elevator: /\bthang may\b/.test(s),
    has_stairs: /\bthang bo\b|\bcau thang\b/.test(s),
    fingerprint_lock: /\bvan tay\b|\bkhoa van tay\b/.test(s),

    allow_pet: allowPet,
    allow_cat: allowCat,
    allow_dog: allowDog,
    no_pet: noPet,

    has_parking:

    /giu xe/.test(s) ||

    /gui xe/.test(s) ||

    /de xe/.test(s) ||

    /xe free/.test(s) ||

    /phi xe/.test(s) ||

    /parking/.test(s),
    has_basement: /\bham xe\b|\btang ham\b/.test(s),

    shared_washer: /\bmay giat chung\b|\bgiat chung\b/.test(s),
    private_washer: /\bmay giat rieng\b|\bgiat rieng\b/.test(s),
    shared_dryer: /\bmay say chung\b|\bsay chung\b/.test(s),
    private_dryer: /\bmay say rieng\b|\bsay rieng\b/.test(s),

    short_term: /\bngan han\b|\b3 thang\b|\b1 thang\b/.test(s),
    long_term: !/\bngan han\b/.test(s),
  }
}

function parsePolicies(text: string) {
  const lines = text
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)

  const result: string[] = []

  const push = (line: string) => {
    if (!line) return
    if (!result.includes(line)) {
      result.push(line)
    }
  }

  for (const line of lines) {
    const s = stripAccent(line)

    // ===== CỌC =====
    if (/\bcoc\b/.test(s)) {
      push(line)
      continue
    }

    // ===== HỢP ĐỒNG =====
    if (/\bhop dong\b|\bhd\b/.test(s)) {
      push(line)
      continue
    }

    // ===== HOA HỒNG =====
    if (/\bhoa hong\b/.test(s)) {
      push(line)
      continue
    }

    // ===== HUỶ CỌC =====
    if (/\bhuy coc\b|\bhoan coc\b|\bmat coc\b/.test(s)) {
      push(line)
      continue
    }

    // ===== PET =====
    if (
      /(?:pet|thu cung|cho nuoi|nuoi pet|cho meo|cho cho)/i.test(s)
    ) {
      push(line)
      continue
    }

    // ===== KHÁCH NƯỚC NGOÀI =====
    if (
      /(?:khach nuoc ngoai|nguoi nuoc ngoai|foreign)/i.test(s)
    ) {
      push(line)
      continue
    }

    // ===== SỐ NGƯỜI =====
    if (
      /(?:so luong nguoi|so nguoi|toi da.*nguoi|o toi da)/i.test(s)
    ) {
      push(line)
      continue
    }

    // ===== GIỮ PHÒNG =====
    if (
      /(?:giu phong|giu toi da|bo sung coc)/i.test(s)
    ) {
      push(line)
      continue
    }

    // ===== CHECK IN =====
    if (
      /(?:check.?in|vao o|nhan phong)/i.test(s)
    ) {
      push(line)
      continue
    }

    // ===== CHÍNH SÁCH =====
    if (/chinh sach/i.test(s)) {
      push(line)
      continue
    }
  }

  return result.join('\n')
}

export function parseAutoReadText(raw: string): AutoReadResult {
  const text = normalizeText(raw)
  const context = createParseContext(text)
  const normalized = stripAccent(text)

const sharedStatus: RoomForm['status'] =
  /sap\s*trong|sắp\s*trống|sap\s*co\s*phong|sắp\s*có\s*phòng/i.test(normalized)
    ? 'Sắp trống'
    : /da\s*thue|đã\s*thuê/i.test(normalized)
      ? 'Đã thuê'
      : 'Đang trống'

  const addressFields = parseAddress(context)
  const sharedRoom: Partial<RoomForm> = {
    ...addressFields,
    room_type: inferRoomType(text),
    status: sharedStatus,
    
    zalo_phone: extractContactPhone(text),

    link_zalo: firstMatch(text, [
      /(https?:\/\/(?:zalo\.me|chat\.zalo\.me)\/[^\s]+)/i,
    ]),
    chinh_sach: mergeUniqueLines([
parsePolicies(text)
]),
  }

  const sharedDetail: Partial<RoomDetail> = {
    ...parseFees(text),
    ...parseAmenities(text),
  }

  const markers = extractRoomMarkers(context)
  const markerLines = markers.map(marker => marker.line)
  void markerLines

  // Theo yêu cầu: Auto read không tự điền mô tả.
  const description = ''

  if (!markers.length) {
    return {
      candidates: [
        {
          room: {
            ...sharedRoom,
            description,
          },
          detail: sharedDetail,
          warnings: [
            'Không tìm thấy dòng phòng có mã và giá rõ ràng. Hãy kiểm tra trước khi áp dụng.',
          ],
          sourceText: text,
        },
      ],
      sharedRoom,
      sharedDetail,
      warnings: ['NO_ROOM_MARKER'],
    }
  }

  return {
    candidates: markers.map(marker => ({
      room: {
        room_code: marker.code,
        room_type:
          marker.roomType ||
          sharedRoom.room_type ||
          '',
        price: marker.price,
        status: marker.status,
        description,
      },
      detail: {},
      warnings: [],
      sourceText: marker.line,
    })),
    sharedRoom: {
      ...sharedRoom,
      // Loại phòng và trạng thái lấy từ dòng phòng đã chọn,
      // không tái sử dụng dữ liệu chung để ghi đè.
      room_type: '',
      status: undefined,
    },
    sharedDetail,
    warnings:
      markers.length > 1
        ? [
          `Đã phát hiện ${markers.length} phòng. Hãy chọn đúng phòng.`,
        ]
        : [],
  }
}

const formatPrice = (value?: number) =>
  Number(value || 0).toLocaleString('vi-VN')

const formatParkingFee = (detail: Partial<RoomDetail>) => {
  const unit = String(detail.parking_fee_unit || '').trim()
  const value = Number(detail.parking_fee_value || 0)

  if (/miễn phí|mien phi/i.test(unit)) {
    return unit
  }

  if (value > 0) {
    return `${formatPrice(value)} / ${unit || 'chiếc'}`
  }

  return ''
}

export default function AutoReadModal({ open, onClose, onApply }: Props) {
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState<AutoReadResult | null>(null)
  const [selected, setSelected] = useState(0)

  const selectedCandidate = useMemo(
    () => result?.candidates?.[selected] ?? null,
    [result, selected]
  )

  if (!open) return null

  const analyze = () => {
    const clean = rawText.trim()
    if (!clean) return
    const parsed = parseAutoReadText(clean)
    setResult(parsed)
    setSelected(0)
  }

  const apply = () => {
    if (!result || !selectedCandidate) return
    onApply(selectedCandidate, {
      room: result.sharedRoom,
      detail: result.sharedDetail,
    })
    onClose()
  }

  return (
    <div style={overlay} onPointerDown={e => e.stopPropagation()}>
      <div style={box} onPointerDown={e => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={title}>Auto read</div>
            <div style={subTitle}>Dán nội dung tin nhắn để tự điền dữ liệu phòng.</div>
          </div>
          <button type="button" style={closeBtn} onClick={onClose}>×</button>
        </div>

        <textarea
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          placeholder={'Ví dụ:\nĐịa chỉ: 90/88F Nguyễn Đình Chiểu, P.5, Quận 3\nP302 - 6tr5\nStudio, máy giặt riêng\nĐiện 4k, nước 100k/người'}
          style={textarea}
          autoFocus
        />

        <div style={actions}>
          <button type="button" style={secondaryBtn} onClick={() => {
            setRawText('')
            setResult(null)
            setSelected(0)
          }}>
            Xóa
          </button>
          <button type="button" style={analyzeBtn} disabled={!rawText.trim()} onClick={analyze}>
            Phân tích
          </button>
        </div>

        {result && (
          <div style={preview}>
            {result.warnings.map((warning, index) => (
              <div key={index} style={warningBox}>⚠ {warning}</div>
            ))}

            {result.candidates.length > 1 && (
              <div style={candidateGrid}>
                {result.candidates.map((candidate, index) => (
                  <button
                    key={`${candidate.room.room_code || 'room'}-${index}`}
                    type="button"
                    onClick={() => setSelected(index)}
                    style={{
                      ...candidateBtn,
                      ...(selected === index ? candidateBtnActive : {}),
                    }}
                  >
                    <strong>{candidate.room.room_code || `Phòng ${index + 1}`}</strong>
                    <span>{formatPrice(candidate.room.price)} đ</span>
                  </button>
                ))}
              </div>
            )}

            {selectedCandidate && (
              <div style={dataCard}>
                <PreviewRow label="Mã phòng" value={selectedCandidate.room.room_code} />
                <PreviewRow label="Loại phòng" value={result.sharedRoom.room_type} />
                <PreviewRow label="Số nhà" value={result.sharedRoom.house_number} />
                <PreviewRow label="Địa chỉ" value={result.sharedRoom.address} />
                <PreviewRow label="Phường" value={result.sharedRoom.ward} />
                <PreviewRow label="Quận" value={result.sharedRoom.district} />
                <PreviewRow label="Giá" value={selectedCandidate.room.price ? `${formatPrice(selectedCandidate.room.price)} đ` : ''} />
                <PreviewRow label="Điện" value={result.sharedDetail.electric_fee_value ? `${formatPrice(result.sharedDetail.electric_fee_value)} / ${result.sharedDetail.electric_fee_unit}` : ''} />
                <PreviewRow label="Nước" value={result.sharedDetail.water_fee_value ? `${formatPrice(result.sharedDetail.water_fee_value)} / ${result.sharedDetail.water_fee_unit}` : ''} />
                <PreviewRow label="Dịch vụ" value={result.sharedDetail.service_fee_value ? `${formatPrice(result.sharedDetail.service_fee_value)} / ${result.sharedDetail.service_fee_unit}` : ''} />
                <PreviewRow
                  label="Giữ xe"
                  value={formatParkingFee(result.sharedDetail)}
                />
                <PreviewRow
                  label="Chi phí khác"
                  value={result.sharedDetail.other_fee_note}
                  multiline
                />
                <PreviewRow label="Mô tả" value={selectedCandidate.room.description} multiline />
                <PreviewRow label="Chính sách" value={result.sharedRoom.chinh_sach} multiline />

                {selectedCandidate.warnings.map((warning, index) => (
                  <div key={index} style={warningBox}>⚠ {warning}</div>
                ))}
              </div>
            )}

            <div style={actions}>
              <button type="button" style={secondaryBtn} onClick={onClose}>Hủy</button>
              <button type="button" style={applyBtn} disabled={!selectedCandidate} onClick={apply}>
                Áp dụng vào form
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewRow({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: unknown
  multiline?: boolean
}) {
  const text = String(value ?? '').trim()
  return (
    <div style={row}>
      <div style={rowLabel}>{label}</div>
      <div style={{ ...rowValue, whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>
        {text || <span style={{ color: '#9ca3af' }}>Chưa nhận diện</span>}
      </div>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10050,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: 16,
  overflowY: 'auto',
}

const box: CSSProperties = {
  width: '100%',
  maxWidth: 760,
  marginTop: 28,
  marginBottom: 28,
  background: '#fff',
  borderRadius: 16,
  boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)',
  padding: 20,
}

const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 14,
}

const title: CSSProperties = { fontSize: 22, fontWeight: 800, color: '#111827' }
const subTitle: CSSProperties = { fontSize: 13, color: '#6b7280', marginTop: 4 }
const closeBtn: CSSProperties = {
  border: 0,
  background: '#f3f4f6',
  width: 36,
  height: 36,
  borderRadius: 10,
  fontSize: 24,
  cursor: 'pointer',
}
const textarea: CSSProperties = {
  width: '100%',
  minHeight: 220,
  resize: 'vertical',
  border: '1px solid #d1d5db',
  borderRadius: 12,
  padding: 14,
  fontSize: 14,
  lineHeight: 1.55,
  outline: 'none',
  boxSizing: 'border-box',
}
const actions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 14,
}
const secondaryBtn: CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
}
const analyzeBtn: CSSProperties = {
  border: 0,
  background: '#111827',
  color: '#fff',
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
}
const applyBtn: CSSProperties = {
  border: 0,
  background: '#2563eb',
  color: '#fff',
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
}
const preview: CSSProperties = { marginTop: 18 }
const warningBox: CSSProperties = {
  background: '#fff7ed',
  border: '1px solid #fdba74',
  color: '#9a3412',
  borderRadius: 10,
  padding: '9px 11px',
  fontSize: 13,
  marginBottom: 10,
}
const candidateGrid: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 12,
}
const candidateBtn: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  border: '1px solid #d1d5db',
  background: '#fff',
  borderRadius: 10,
  padding: '9px 12px',
  cursor: 'pointer',
  color: '#111827',
}
const candidateBtnActive: CSSProperties = {
  borderColor: '#2563eb',
  background: '#eff6ff',
  color: '#1d4ed8',
}
const dataCard: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  overflow: 'hidden',
}
const row: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '150px minmax(0, 1fr)',
  borderBottom: '1px solid #f3f4f6',
}
const rowLabel: CSSProperties = {
  padding: '10px 12px',
  background: '#f9fafb',
  fontSize: 13,
  fontWeight: 700,
  color: '#374151',
}
const rowValue: CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  color: '#111827',
  overflowWrap: 'anywhere',
}
