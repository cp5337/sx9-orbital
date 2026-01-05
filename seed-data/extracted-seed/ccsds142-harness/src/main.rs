//! CCSDS 142.0 Framing/Deframing Harness (Scaffold)
//! NOTE: Coding (LDPC/RS) intentionally not implemented; wire here after FPGA/HDL selection.

use anyhow::*;
use rand::Rng;

#[derive(Debug, Clone)]
pub struct Frame {
    pub version: u8,
    pub scid: u16,
    pub vcid: u8,
    pub seq: u32,
    pub payload: Vec<u8>,
}

impl Frame {
    pub fn build(scid: u16, vcid: u8, seq: u32, payload: &[u8]) -> Self {
        Self { version: 1, scid, vcid, seq, payload: payload.to_vec() }
    }
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut v = Vec::new();
        v.push(self.version);
        v.extend(self.scid.to_be_bytes());
        v.push(self.vcid);
        v.extend(self.seq.to_be_bytes());
        v.extend(&self.payload);
        // TODO: add sync marker, scrambler, FEC (per CCSDS 142.0)
        v
    }
    pub fn parse(raw: &[u8]) -> Result<Self> {
        if raw.len() < 1+2+1+4 { bail!("frame too short"); }
        let version = raw[0];
        let scid = u16::from_be_bytes([raw[1], raw[2]]);
        let vcid = raw[3];
        let seq = u32::from_be_bytes([raw[4],raw[5],raw[6],raw[7]]);
        let payload = raw[8..].to_vec();
        Ok(Self{version, scid, vcid, seq, payload})
    }
}

fn main() -> Result<()> {
    // Demo
    let payload: Vec<u8> = (0..32).map(|_| rand::thread_rng().gen()).collect();
    let f = Frame::build(0x0420, 7, 1, &payload);
    let raw = f.to_bytes();
    let back = Frame::parse(&raw)?;
    println!("frame: version={} scid={:#x} vcid={} seq={} payload_len={}",
             back.version, back.scid, back.vcid, back.seq, back.payload.len());
    Ok(())
}
