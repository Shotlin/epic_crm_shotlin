# Epic BOS retail workspace visual references

These eight PNG files are the approved visual references for the primary
retail workspaces:

1. `01_home_command_centre.png`
2. `02_sell_pos.png`
3. `03_stock_purchase.png`
4. `04_delivery_control.png`
5. `05_customer_360.png`
6. `06_money_close.png`
7. `07_insights_executive.png`
8. `08_setup_admin.png`

They define the retail-first blue, white, and navy visual language, navigation
hierarchy, density, and information priorities. They are not test fixtures or
sample business data. Runtime screenshots must always show the governed state
of the clean or imported Epic BOS workspace being tested.

`e2e/electron/retail-visual-regression.e2e.ts` records a current, real
packaged-app screenshot for every route at 1600×1000. The evidence test makes
semantic and layout assertions, then writes a manifest for human comparison.
It intentionally does **not** claim pixel parity or use synthetic image
comparison results as product evidence.
