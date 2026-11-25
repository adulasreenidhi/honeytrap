# HoneyGate Detection Validation Report

## Methodology

All activity was generated in-process through FastAPI `TestClient` against synthetic seed data in a fresh in-memory SQLite database per run. No external hosts or network traffic were used. The baseline uses seed `20260604`, 20 repetitions, and 220 deterministic seeded-random actions per benign profile. Attack/profile order is shuffled from the run seed, with 0–2 seconds of request jitter; profile action intervals receive additional ±10-second variation. Measurements below are from the most recent validation run recorded in `tests/simulations/results.json`.

An attack is a true positive when its required scenario-specific rule set fires. Confusion-matrix “flagged” means any detection rule fired. The session false-positive rate counts benign sessions that receive RESTRICT or DENY; the action false-positive rate counts benign API actions with a rule finding or RESTRICT/DENY response. Failed login attempts that return 401 without a detection finding are not counted as a false positive.

## Headline results

- Attack detection rate: **100.00%** (160/160)
- Benign-session RESTRICT/DENY rate: **0.00%**
- Benign-action flagged rate: **0.00%**
- Confusion matrix (attack/benign × flagged/not flagged): TP 160, FN 0, FP 0, TN 140
- Time to contain: mean **8.2 ActivityEvents** / **3.99 seconds**; maximum **27 ActivityEvents** / **16.00 seconds**
- Most-fired rules: sensitive_resource_access (120), decoy_interaction (40), resource_enumeration (40), abnormal_file_access (20), velocity_burst (20)

## Attack scenario results

| Scenario | Detection | Rules observed | Mean ActivityEvents to containment | Mean seconds to containment |
|---|---:|---|---:|---:|
| credential_stuffing | 20/20 (100.00%) | login_attack_pattern | 6.0 | 5.75
| decoy_touch | 20/20 (100.00%) | decoy_interaction, sensitive_resource_access | 8.0 | 3.25
| enumeration_scan | 20/20 (100.00%) | decoy_interaction, resource_enumeration, sensitive_resource_access | 4.0 | 2.00
| insider_data_hoarding | 20/20 (100.00%) | abnormal_file_access, resource_enumeration, sensitive_resource_access, velocity_burst | 27.0 | 11.55
| privilege_escalation_probe | 20/20 (100.00%) | privilege_probing, sensitive_resource_access, unauthorized_resource | 5.0 | 2.40
| slow_and_low | 20/20 (100.00%) | sensitive_resource_access, slow_and_low_exfiltration | 4.0 | 1.90
| stolen_credentials_unknown_device | 20/20 (100.00%) | sensitive_resource_access, unknown_device, unusual_location | 6.0 | 1.55
| token_replay | 20/20 (100.00%) | token_context_change | 6.0 | 3.50

## Benign profile results

| Profile | Sessions RESTRICTED/DENIED | Actions flagged | Rules observed |
|---|---:|---:|---|
| benign_control | 0/20 (0.00%) | 0/160 (0.00%) | none |
| engineer_document_research | 0/20 (0.00%) | 0/4420 (0.00%) | none |
| finance_analyst | 0/20 (0.00%) | 0/4420 (0.00%) | none |
| hr_clerk | 0/20 (0.00%) | 0/4420 (0.00%) | none |
| month_end_report_crunch | 0/20 (0.00%) | 0/4420 (0.00%) | none |
| registered_device_legitimate_travel | 0/20 (0.00%) | 0/4420 (0.00%) | none |
| two_password_typos | 0/20 (0.00%) | 0/4460 (0.00%) | none |

The six profiles represent HR policy reading, Finance file review, engineering documentation search, registered-device travel, month-end reporting, and two mistyped passwords. Any non-zero benign finding is reported above with its rule key; the profile and rule should be reviewed before interpreting aggregate rates as production performance.

## Sensitivity sweep

The sweep uses 2 repetition(s) per setting and 20 actions per benign profile to make one-factor-at-a-time parameter comparisons reproducible. It varies the restrict threshold over 50/60/70/80/90 and each seeded risk weight independently at 0.75× and 1.25×. These are calibration measurements on a smaller sample, not the headline baseline. Decoy touches are asserted to remain DENY at every tested setting.

| Sweep | Policy | Value | Detection rate | Benign-session RESTRICT/DENY | Benign-action flagged |
|---|---|---:|---:|---:|---:|
| restrict_threshold | restrict_threshold | 50 | 100.00% | 0.00% | 0.00% |
| restrict_threshold | restrict_threshold | 60 | 100.00% | 0.00% | 0.00% |
| restrict_threshold | restrict_threshold | 70 | 100.00% | 0.00% | 0.00% |
| restrict_threshold | restrict_threshold | 80 | 100.00% | 0.00% | 0.00% |
| restrict_threshold | restrict_threshold | 90 | 100.00% | 0.00% | 0.00% |
| risk_weight | abnormal_file_access | 15.0 | 100.00% | 0.00% | 0.00% |
| risk_weight | abnormal_file_access | 25.0 | 100.00% | 0.00% | 0.00% |
| risk_weight | credential_hunting | 11.25 | 100.00% | 0.00% | 0.00% |
| risk_weight | credential_hunting | 18.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | decoy_interaction | 37.5 | 100.00% | 0.00% | 0.00% |
| risk_weight | decoy_interaction | 62.5 | 100.00% | 0.00% | 0.00% |
| risk_weight | impossible_travel | 18.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | impossible_travel | 31.25 | 100.00% | 0.00% | 0.00% |
| risk_weight | login_attack_pattern | 26.25 | 100.00% | 0.00% | 0.00% |
| risk_weight | login_attack_pattern | 43.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | off_hours_access | 7.5 | 100.00% | 0.00% | 0.00% |
| risk_weight | off_hours_access | 12.5 | 100.00% | 0.00% | 0.00% |
| risk_weight | privilege_probing | 15.0 | 100.00% | 0.00% | 0.00% |
| risk_weight | privilege_probing | 25.0 | 100.00% | 0.00% | 0.00% |
| risk_weight | resource_enumeration | 15.0 | 100.00% | 0.00% | 0.00% |
| risk_weight | resource_enumeration | 25.0 | 100.00% | 0.00% | 0.00% |
| risk_weight | slow_and_low_exfiltration | 18.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | slow_and_low_exfiltration | 31.25 | 100.00% | 0.00% | 0.00% |
| risk_weight | suspicious_behaviour | 11.25 | 100.00% | 0.00% | 0.00% |
| risk_weight | suspicious_behaviour | 18.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | token_context_change | 26.25 | 100.00% | 0.00% | 0.00% |
| risk_weight | token_context_change | 43.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | unknown_device | 11.25 | 100.00% | 0.00% | 0.00% |
| risk_weight | unknown_device | 18.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | unusual_location | 7.5 | 100.00% | 0.00% | 0.00% |
| risk_weight | unusual_location | 12.5 | 100.00% | 0.00% | 0.00% |
| risk_weight | velocity_burst | 18.75 | 100.00% | 0.00% | 0.00% |
| risk_weight | velocity_burst | 31.25 | 100.00% | 0.00% | 0.00% |

## Seeded defaults used

The values below are the final seeded defaults evaluated by the run. The final measured benign rates are 0.00% for contained sessions and 0.00% for flagged actions. The decoy response remains an unconditional DENY regardless of score or weight.

| Policy key | Value | Enabled |
|---|---:|---|
| abnormal_file_access | 20 | yes |
| credential_hunting | 15 | yes |
| credential_hunting_decoy_bonus | 25 | yes |
| decoy_interaction | 50 | yes |
| impossible_travel | 25 | yes |
| impossible_travel_max_speed_kmh | 900 | yes |
| login_attack_min_failures | 4 | yes |
| login_attack_min_usernames | 3 | yes |
| login_attack_pattern | 35 | yes |
| login_attack_window_minutes | 60 | yes |
| max_files_per_window | 8 | yes |
| max_searches_per_window | 8 | yes |
| off_hours_access | 10 | yes |
| privilege_probing | 20 | yes |
| privilege_probing_min_denials | 2 | yes |
| privilege_probing_window_minutes | 5 | yes |
| resource_enumeration | 20 | yes |
| resource_enumeration_min_departments | 3 | yes |
| resource_enumeration_min_resources | 5 | yes |
| resource_enumeration_min_sequential | 4 | yes |
| resource_enumeration_window_seconds | 60 | yes |
| restrict_threshold | 70 | yes |
| risk_decay_interval_minutes | 15 | yes |
| risk_decay_points | 2 | yes |
| slow_and_low_exfiltration | 25 | yes |
| slow_and_low_max_sensitive_requests | 5 | yes |
| slow_and_low_window_minutes | 60 | yes |
| suspicious_behaviour | 15 | yes |
| token_context_change | 35 | yes |
| unknown_device | 15 | yes |
| unusual_location | 10 | yes |
| velocity_burst | 25 | yes |
| velocity_burst_max_requests | 10 | yes |
| velocity_burst_window_seconds | 30 | yes |
| window_minutes | 5 | yes |
| working_hours_end_hour | 18 | yes |
| working_hours_start_hour | 8 | yes |

### Applied tuning

The initial 20-repetition run with `max_searches_per_window=5` produced `suspicious_behaviour` findings in all 20 engineering-search runs and one month-end run, restricting 15/140 benign sessions and flagging 1515/26720 benign actions. The search-volume threshold was raised to 8 while preserving the finding and its risk weight; the targeted simulation now sends ten searches inside five minutes to prove the rule still fires. The final-run benign rates above measure this change. The decoy weight and unconditional DENY behavior were not weakened.

## MITRE ATT&CK mapping and simulation coverage

| Rule | Description | Technique | Weight | Enabled | Covering simulation |
|---|---|---|---:|---|---|
| abnormal_file_access | File-access volume exceeds the configured short-window limit. | T1005 Data from Local System | 20.0 | yes | insider_data_hoarding |
| credential_hunting | Searches contain credential or sensitive-data terms. | T1552 Unsecured Credentials | 15.0 | yes | test_credential_hunting_decoy_bonus_is_deduplicated |
| decoy_interaction | A request touches a monitored synthetic decoy. | T1552 Unsecured Credentials | 50.0 | yes | decoy_touch, enumeration_scan |
| impossible_travel | Known demo locations change faster than the configured travel limit. | T1078 Valid Accounts | 25.0 | yes | test_impossible_travel_uses_demo_location_lookup |
| login_attack_pattern | A successful login follows repeated failures across accounts or for that username. | T1110 Brute Force | 35.0 | yes | credential_stuffing |
| off_hours_access | Access occurs outside configured UTC working hours. | T1078 Valid Accounts | 10.0 | yes | test_off_hours_access_is_policy_configurable |
| privilege_probing | Repeated denied access decisions suggest privilege probing. | T1069 Permission Groups Discovery | 20.0 | yes | privilege_escalation_probe |
| resource_enumeration | Resource IDs or departments are probed in a short window. | T1083 File and Directory Discovery | 20.0 | yes | insider_data_hoarding, enumeration_scan |
| revoked_device | Access from a device marked as revoked. | T1078 Valid Accounts | 15.0 | yes | test_revoked_device_rule_is_covered |
| sensitive_resource_access | An employee requests a high- or critical-sensitivity resource. | T1005 Data from Local System | 15.0 | yes | insider_data_hoarding, slow_and_low |
| slow_and_low_exfiltration | Sensitive-resource accesses accumulate beyond a long-window limit. | T1005 Data from Local System | 25.0 | yes | slow_and_low |
| suspicious_behaviour | Search volume exceeds the configured short-window limit. | T1083 File and Directory Discovery | 15.0 | yes | test_search_volume_rule_is_covered |
| token_context_change | A request's client IP or User-Agent differs from login context. | T1550 Use Alternate Authentication Material | 35.0 | yes | token_replay |
| unauthorized_resource | A non-admin requests a resource outside their department. | T1083 File and Directory Discovery | 15.0 | yes | privilege_escalation_probe |
| unknown_device | Access from a device not present in the device registry. | T1078 Valid Accounts | 15.0 | yes | stolen_credentials_unknown_device |
| unusual_location | Access location differs from the user's usual location. | T1078 Valid Accounts | 10.0 | yes | stolen_credentials_unknown_device |
| unverified_device | Access from a device that has not completed verification. | T1078 Valid Accounts | 15.0 | yes | test_unverified_device_rule_is_covered |
| velocity_burst | Resource requests exceed the configured short burst limit. | T1005 Data from Local System | 25.0 | yes | insider_data_hoarding |

An `UNCOVERED` entry indicates the API coverage metadata reports no associated simulation scenario and requires follow-up test coverage.

## Limitations

- Data and user identities are synthetic; results are not a guarantee of production performance.
- Access and response actions are simulated locally. No external network or real endpoint is exercised.
- Detection is rule-based, not machine learning, and policy values are demonstration defaults.
- Demo-location travel calculations and the in-memory SQLite database do not represent full production geography, concurrency, or persistence.
- Decoys are indicators of compromise requiring investigation, not proof of identity or malicious intent.
- Randomized actions are deterministic for the recorded seed; different workflows and timing distributions may yield different results.

## Recommended next steps

1. Review every benign finding in the profile table and tune only the responsible rule/threshold; do not weaken the decoy DENY.
2. Expand labeled benign and attack simulations from observed, privacy-reviewed workflows.
3. Validate policy changes against held-out seeds and report confidence intervals before deployment.
4. Move rate limiting and audit-chain state to durable shared infrastructure before multi-worker production use.
5. Monitor audit-chain failures and treat detection results as indicators of compromise requiring investigation.

## Frontend follow-up note

The frontend can display `mitre_attack_id` on timeline events, `evidence_integrity` and `audit_integrity` status on incident reports, and the detection-coverage table fields `rule_key`, `description`, `mitre_attack_id`, `technique_name`, `current_weight`, `enabled`, and `simulation_covered`.
