
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getKrxIndex } from "./indices.js";
import { kiwoomPost } from "./client.js";

// 실제 키움 API를 호출하지 않고 테스트 응답 사용
vi.mock("./client.js", () => ({
  kiwoomPost: vi.fn(),
}));

const mockPost = vi.mocked(kiwoomPost);

describe("KRX index provider", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  // 1. KOSPI 데이터 정규화
  it("normalizes KOSPI index data", async () => {
    mockPost.mockResolvedValue({
      cur_prc: "-5290.53",
      pred_pre: "-52.20",
      flu_rt: "-0.98",
      pred_pre_sig: "5",
      open_pric: "+5452.41",
      high_pric: "+5504.44",
      low_pric: "-5259.09",
      trde_qty: "247829",
      trde_prica: "16718835",
    });

    const result = await getKrxIndex("001", "real");

    expect(result.code).toBe("001");
    expect(result.name).toBe("KOSPI");
    expect(result.mode).toBe("real");
    expect(result.price).toBe(5290.53);
    expect(result.change).toBe(-52.2);
    expect(result.changePercent).toBe(-0.98);
    expect(result.changeSign).toBe("5");
    expect(result.open).toBe(5452.41);
    expect(result.high).toBe(5504.44);
    expect(result.low).toBe(5259.09);
    expect(result.volume).toBe(247829);
    expect(result.tradingValue).toBe(16718835);

    expect(mockPost).toHaveBeenCalledWith(
      "ka20001",
      "/api/dostk/sect",
      {
        mrkt_tp: "0",
        inds_cd: "001",
      },
      "real"
    );
  });

  // 2. KOSDAQ 데이터 정규화
  it("normalizes KOSDAQ index data", async () => {
    mockPost.mockResolvedValue({
      cur_prc: "699.66",
      pred_pre: "+3.13",
      flu_rt: "+0.45",
      pred_pre_sig: "2",
    });

    const result = await getKrxIndex("101", "demo");

    expect(result.code).toBe("101");
    expect(result.name).toBe("KOSDAQ");
    expect(result.mode).toBe("demo");
    expect(result.price).toBe(699.66);
    expect(result.change).toBe(3.13);
    expect(result.changePercent).toBe(0.45);
    expect(result.changeSign).toBe("2");

    expect(mockPost).toHaveBeenCalledWith(
      "ka20001",
      "/api/dostk/sect",
      {
        mrkt_tp: "1",
        inds_cd: "101",
      },
      "demo"
    );
  });

  it("includes the time the successful response was checked", async () => {
    const checkedAt = "2026-11-14T01:23:45.000Z";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(checkedAt));
    mockPost.mockResolvedValue({ cur_prc: "699.66" });

    try {
      const result = await getKrxIndex("101", "demo");
      expect(result.checkedAt).toBe(checkedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  // 3. 현재가가 0인 경우
  it("rejects a zero index price", async () => {
    mockPost.mockResolvedValue({
      cur_prc: "0",
    });

    await expect(
      getKrxIndex("001", "demo")
    ).rejects.toThrow(
      "Invalid KOSPI index price"
    );
  });

  // 4. 현재가가 숫자가 아닌 경우
  it("rejects an invalid index price", async () => {
    mockPost.mockResolvedValue({
      cur_prc: "INVALID",
    });

    await expect(
      getKrxIndex("001", "demo")
    ).rejects.toThrow(
      "Invalid KOSPI index price"
    );
  });

  // 5. 현재가 필드가 없는 경우
  it("rejects a missing index price", async () => {
    mockPost.mockResolvedValue({});

    await expect(
      getKrxIndex("101", "demo")
    ).rejects.toThrow(
      "Invalid KOSDAQ index price"
    );
  });

  // 6. 키움 API 호출 오류
  it("propagates API errors", async () => {
    mockPost.mockRejectedValue(
      new Error("Kiwoom API request failed")
    );

    await expect(
      getKrxIndex("001", "real")
    ).rejects.toThrow(
      "Kiwoom API request failed"
    );
  });

  // 7. 전일 대비와 등락률이 일치하지 않는 경우
  it("rejects inconsistent change percentage", async () => {
    mockPost.mockResolvedValue({
      cur_prc: "5290.53",
      pred_pre: "-52.20",
      flu_rt: "+5.00",
      pred_pre_sig: "5",
    });

    await expect(
      getKrxIndex("001", "real")
    ).rejects.toThrow(
      "Inconsistent KOSPI index change"
    );
  });

  // 8. 전일 대비와 등락 기호가 일치하지 않는 경우
  it("rejects inconsistent change sign", async () => {
    mockPost.mockResolvedValue({
      cur_prc: "5290.53",
      pred_pre: "+52.20",
      flu_rt: "+1.00",
      pred_pre_sig: "5",
    });

    await expect(
      getKrxIndex("001", "real")
    ).rejects.toThrow(
      "Inconsistent KOSPI change sign"
    );
  });
});
