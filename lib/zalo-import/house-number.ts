const houseNumberSegment = String.raw`(?:[A-Za-z]{1,4})?\d+[A-Za-z0-9]{0,4}`;

export const houseNumberSource = String.raw`${houseNumberSegment}(?:\s*[/\-]\s*${houseNumberSegment})*`;
