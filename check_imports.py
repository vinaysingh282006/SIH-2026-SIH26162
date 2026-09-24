import sys
sys.path.insert(0, '.')

errors = []

try:
    from ml.isolation_forest import fit_all, score_reading as if_score
    print("  [OK] ml.isolation_forest")
except Exception as e:
    errors.append(f"  [FAIL] ml.isolation_forest: {e}")

try:
    from ml.lstm_autoencoder import load_model, score_reading as lstm_score
    print("  [OK] ml.lstm_autoencoder")
except Exception as e:
    errors.append(f"  [FAIL] ml.lstm_autoencoder: {e}")

try:
    from ml.statistical_detector import detect_statistical_all_sensors
    print("  [OK] ml.statistical_detector")
except Exception as e:
    errors.append(f"  [FAIL] ml.statistical_detector: {e}")

try:
    from ml.cross_sensor import detect_cross_sensor
    print("  [OK] ml.cross_sensor")
except Exception as e:
    errors.append(f"  [FAIL] ml.cross_sensor: {e}")

try:
    from ml.spatial_consistency import detect_spatial
    print("  [OK] ml.spatial_consistency")
except Exception as e:
    errors.append(f"  [FAIL] ml.spatial_consistency: {e}")

try:
    from ml.ensemble_fusion import fuse
    print("  [OK] ml.ensemble_fusion")
except Exception as e:
    errors.append(f"  [FAIL] ml.ensemble_fusion: {e}")

try:
    from ml.explainability import generate_explanation
    print("  [OK] ml.explainability")
except Exception as e:
    errors.append(f"  [FAIL] ml.explainability: {e}")

try:
    from ml.health_scoring import update as health_update
    print("  [OK] ml.health_scoring")
except Exception as e:
    errors.append(f"  [FAIL] ml.health_scoring: {e}")

try:
    from ml.imputation import impute
    print("  [OK] ml.imputation")
except Exception as e:
    errors.append(f"  [FAIL] ml.imputation: {e}")

try:
    from backend.state import state
    print("  [OK] backend.state")
except Exception as e:
    errors.append(f"  [FAIL] backend.state: {e}")

try:
    from backend.pipeline import process_reading
    print("  [OK] backend.pipeline")
except Exception as e:
    errors.append(f"  [FAIL] backend.pipeline: {e}")

try:
    from data.bootstrap_history import bootstrap
    print("  [OK] data.bootstrap_history")
except Exception as e:
    errors.append(f"  [FAIL] data.bootstrap_history: {e}")

if errors:
    print("\nERRORS:")
    for e in errors:
        print(e)
    sys.exit(1)
else:
    print("\nAll imports OK!")
