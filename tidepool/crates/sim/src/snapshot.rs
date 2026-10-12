//! Little-endian byte writer and reader, CRC32, and the snapshot envelope. The state hash is the CRC
//! of what the writer produced.

pub const MAGIC: [u8; 4] = *b"TDPL";
pub const FORMAT_VERSION: u32 = 6;
/// Magic, version, payload length, and checksum.
const ENVELOPE_BYTES: usize = 16;

#[derive(Debug, PartialEq)]
pub enum LoadError {
    TooShort,
    BadMagic,
    BadVersion(u32),
    BadChecksum,
    Truncated,
    Invalid(&'static str),
}

#[derive(Default)]
pub struct Writer {
    pub bytes: Vec<u8>,
}

impl Writer {
    pub fn new() -> Writer {
        Writer::default()
    }

    pub fn u32(&mut self, v: u32) {
        self.bytes.extend_from_slice(&v.to_le_bytes());
    }

    pub fn f32(&mut self, v: f32) {
        self.u32(v.to_bits());
    }

    pub fn u64(&mut self, v: u64) {
        self.bytes.extend_from_slice(&v.to_le_bytes());
    }

    /// Length prefix, then values.
    pub fn u32s(&mut self, v: &[u32]) {
        self.u32(v.len() as u32);
        for &x in v {
            self.u32(x);
        }
    }

    pub fn f32s(&mut self, v: &[f32]) {
        self.u32(v.len() as u32);
        for &x in v {
            self.f32(x);
        }
    }

    pub fn u16s(&mut self, v: &[u16]) {
        self.u32(v.len() as u32);
        for &x in v {
            self.bytes.extend_from_slice(&x.to_le_bytes());
        }
    }

    pub fn u8s(&mut self, v: &[u8]) {
        self.u32(v.len() as u32);
        self.bytes.extend_from_slice(v);
    }
}

/// Reads what `Writer` wrote. Never panics: reading past the end is `Truncated`.
pub struct Reader<'a> {
    /// The bytes not yet read.
    bytes: &'a [u8],
}

impl<'a> Reader<'a> {
    pub fn new(bytes: &'a [u8]) -> Reader<'a> {
        Reader { bytes }
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], LoadError> {
        let (head, tail) = self.bytes.split_at_checked(n).ok_or(LoadError::Truncated)?;
        self.bytes = tail;
        Ok(head)
    }

    /// Length prefix, then that many values of `size` bytes. The length is checked against the bytes
    /// that remain, so a caller allocates no more than the input holds.
    fn array(&mut self, size: usize) -> Result<std::slice::ChunksExact<'a, u8>, LoadError> {
        let n = self.u32()? as usize;
        let len = n.checked_mul(size).ok_or(LoadError::Truncated)?;
        Ok(self.take(len)?.chunks_exact(size))
    }

    pub fn u32(&mut self) -> Result<u32, LoadError> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    pub fn f32(&mut self) -> Result<f32, LoadError> {
        Ok(f32::from_bits(self.u32()?))
    }

    pub fn u64(&mut self) -> Result<u64, LoadError> {
        let (lo, hi) = (self.u32()?, self.u32()?);
        Ok(lo as u64 | (hi as u64) << 32)
    }

    pub fn u32s(&mut self) -> Result<Vec<u32>, LoadError> {
        let values = self.array(4)?;
        Ok(values
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect())
    }

    pub fn f32s(&mut self) -> Result<Vec<f32>, LoadError> {
        Ok(self.u32s()?.into_iter().map(f32::from_bits).collect())
    }

    pub fn u16s(&mut self) -> Result<Vec<u16>, LoadError> {
        let values = self.array(2)?;
        Ok(values.map(|b| u16::from_le_bytes([b[0], b[1]])).collect())
    }

    pub fn u8s(&mut self) -> Result<Vec<u8>, LoadError> {
        let n = self.u32()? as usize;
        Ok(self.take(n)?.to_vec())
    }

    /// Call after the last read. Bytes left over are `Invalid`.
    pub fn end(&self) -> Result<(), LoadError> {
        if self.bytes.is_empty() {
            Ok(())
        } else {
            Err(LoadError::Invalid("trailing bytes"))
        }
    }
}

/// Wraps a payload: `MAGIC`, `FORMAT_VERSION`, payload length, payload, `crc32(payload)`.
pub fn seal(payload: &[u8]) -> Vec<u8> {
    let mut w = Writer::new();
    w.bytes.extend_from_slice(&MAGIC);
    w.u32(FORMAT_VERSION);
    w.u8s(payload);
    w.u32(crc32(payload));
    w.bytes
}

/// Checks the envelope that `seal` wrote and returns the payload.
pub fn open(bytes: &[u8]) -> Result<&[u8], LoadError> {
    if bytes.len() < ENVELOPE_BYTES {
        return Err(LoadError::TooShort);
    }
    let mut r = Reader::new(bytes);
    if r.take(MAGIC.len())? != MAGIC {
        return Err(LoadError::BadMagic);
    }
    let version = r.u32()?;
    if version != FORMAT_VERSION {
        return Err(LoadError::BadVersion(version));
    }
    let len = r.u32()? as usize;
    let payload = r.take(len)?;
    let crc = r.u32()?;
    r.end()?;
    if crc32(payload) != crc {
        return Err(LoadError::BadChecksum);
    }
    Ok(payload)
}

const CRC_TABLE: [u32; 256] = {
    let mut table = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = i as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 {
                0xEDB8_8320 ^ (c >> 1)
            } else {
                c >> 1
            };
            k += 1;
        }
        table[i] = c;
        i += 1;
    }
    table
};

/// IEEE CRC32.
pub fn crc32(bytes: &[u8]) -> u32 {
    let mut c = !0u32;
    for &b in bytes {
        c = CRC_TABLE[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    !c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reader_returns_what_writer_wrote() {
        let mut w = Writer::new();
        w.u32(7);
        w.f32(-0.5);
        w.u64(u64::MAX - 1);
        w.u32s(&[1, u32::MAX]);
        w.f32s(&[1.5, f32::MIN]);
        w.u16s(&[2, u16::MAX]);
        w.u8s(&[3, u8::MAX]);
        let mut r = Reader::new(&w.bytes);
        assert_eq!((r.u32(), r.f32()), (Ok(7), Ok(-0.5)));
        assert_eq!(r.u64(), Ok(u64::MAX - 1));
        assert_eq!(r.u32s(), Ok(vec![1, u32::MAX]));
        assert_eq!(r.f32s(), Ok(vec![1.5, f32::MIN]));
        assert_eq!(r.u16s(), Ok(vec![2, u16::MAX]));
        assert_eq!(r.u8s(), Ok(vec![3, u8::MAX]));
        assert_eq!(r.end(), Ok(()));
        assert_eq!(r.u32(), Err(LoadError::Truncated));
    }

    #[test]
    fn crc32_matches_the_ieee_check_value() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    }
}
