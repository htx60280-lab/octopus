import unittest

from scripts.updatePrice import collect_entries


class UpdatePriceTest(unittest.TestCase):
    def test_duplicate_model_ids_generate_one_go_entry(self):
        raw_price = {
            "zhipuai": {
                "models": {
                    "first": {"id": "GLM-5.2", "cost": {"input": 1}},
                    "second": {"id": "glm-5.2", "cost": {"input": 2}},
                }
            }
        }

        entries, _ = collect_entries(raw_price)

        self.assertEqual(len(entries), 1)
        self.assertIn('"glm-5.2": {Input: 2', entries["glm-5.2"])


if __name__ == "__main__":
    unittest.main()
