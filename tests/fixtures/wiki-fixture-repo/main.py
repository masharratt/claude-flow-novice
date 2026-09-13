"""Fixture entrypoint: clean raw lines, then build a report.

Wires the two fixture features together: parsing (parsing/) turns raw text
into structured records, reporting (reporting/) renders them.
"""
import service
import util


def main():
    raw = ["Alpha,1", "Beta,2", "Gamma,3"]
    cleaned = [util.clean_token(line) for line in raw]
    report = service.build_report(cleaned)
    print(report)


if __name__ == "__main__":
    main()
