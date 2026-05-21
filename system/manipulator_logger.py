import logging
import os

os.makedirs("logs", exist_ok=True)

manipulator_logger = logging.getLogger(
    "manipulator"
)

if not manipulator_logger.handlers:

    handler = logging.FileHandler(
        "logs/manipulator.log",
        encoding="utf-8"
    )

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s"
    )

    handler.setFormatter(formatter)

    manipulator_logger.addHandler(handler)

    manipulator_logger.setLevel(logging.INFO)
