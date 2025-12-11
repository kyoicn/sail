import unittest
import sys
import os

# 将 src 目录加入路径，以便导入模块
# 假设运行目录是 data-pipeline/
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.lib.time_normalizer import normalize_time, is_leap_year
from src.lib.geo_normalizer import normalize_geo

class TestTimeNormalizer(unittest.TestCase):
    
    def test_is_leap_year(self):
        """测试闰年逻辑 (天文纪年法)"""
        # 2000 是闰年 (能被 400 整除)
        self.assertTrue(is_leap_year(2000))
        # 1900 不是闰年 (能被 100 整除但不能被 400 整除)
        self.assertFalse(is_leap_year(1900))
        # 2024 是闰年
        self.assertTrue(is_leap_year(2024))
        
        # 天文纪年 0 年 (1 BC) 是闰年 (0 % 4 == 0)
        self.assertTrue(is_leap_year(0))
        # 天文纪年 -1 年 (2 BC) 不是闰年
        self.assertFalse(is_leap_year(-1))
        # 天文纪年 -4 年 (5 BC) 是闰年
        self.assertTrue(is_leap_year(-4))

    def test_normalize_time_ad(self):
        """测试公元后日期"""
        # 二战结束: 1945-09-02
        res = normalize_time("+1945-09-02T00:00:00Z")
        self.assertIsNotNone(res)
        self.assertEqual(res['year'], 1945)
        self.assertEqual(res['month'], 9)
        self.assertEqual(res['day'], 2)
        # 1945 + (Sep 2 is roughly 245th day) / 365
        self.assertAlmostEqual(res['astro_year'], 1945.668, places=2)
        self.assertEqual(res['precision'], 'day')

    def test_normalize_time_bc(self):
        """测试公元前日期 (关键: 天文纪年转换)"""
        # 凯撒遇刺: 44 BC (天文年份 -43)
        res = normalize_time("-0044-03-15T00:00:00Z")
        self.assertIsNotNone(res)
        self.assertEqual(res['year'], -44)
        # 验证天文年份转换: 1 BC = 0, 44 BC = -43
        # -43 + (March 15 is roughly 74th day) / 366 (since -44 is leap in Julian? 
        # Note: Our simple logic uses proleptic Gregorian/Astronomical leap rules on astro year)
        # -43 is NOT leap year. 365 days.
        self.assertTrue(-43.0 < res['astro_year'] < -42.0)

    def test_normalize_time_1bc(self):
        """测试 1 BC (边界情况)"""
        res = normalize_time("-0001-01-01T00:00:00Z")
        self.assertEqual(res['year'], -1)
        # 1 BC 应该是天文年份 0.0
        self.assertEqual(int(res['astro_year']), 0)
        self.assertTrue(res['astro_year'] >= 0.0)

    def test_invalid_time(self):
        self.assertIsNone(normalize_time("Not a date"))
        self.assertIsNone(normalize_time(None))


class TestGeoNormalizer(unittest.TestCase):

    def test_normalize_geo_valid(self):
        """测试标准 WKT 格式"""
        # 伦敦: 经度 -0.12, 纬度 51.5
        wkt = "Point(-0.12 51.5)"
        res = normalize_geo(wkt)
        self.assertIsNotNone(res)
        self.assertEqual(res['lat'], 51.5)
        self.assertEqual(res['lng'], -0.12)
        self.assertEqual(res['wkt'], "POINT(-0.12 51.5)")

    def test_normalize_geo_messy(self):
        """测试不规范格式 (大小写, 空格)"""
        wkt = "  point ( -0.12   51.5 ) "
        res = normalize_geo(wkt)
        self.assertEqual(res['lat'], 51.5)
        self.assertEqual(res['lng'], -0.12)

    def test_normalize_geo_invalid_range(self):
        """测试无效坐标"""
        self.assertIsNone(normalize_geo("Point(200 51.5)")) # 经度超标
        self.assertIsNone(normalize_geo("Point(0 100)"))   # 纬度超标

    def test_normalize_geo_bad_string(self):
        self.assertIsNone(normalize_geo("Not a point"))
        self.assertIsNone(normalize_geo(None))

if __name__ == '__main__':
    unittest.main()