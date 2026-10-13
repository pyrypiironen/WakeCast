import xml.etree.ElementTree as ET

import pytest

from app.services.fmi_forecast import (
    HARMONIE_FIELD_MAP,
    parse_forecast,
)


def make_forecast_xml(fields):
    field_xml = "".join(f'<swe:field name="{name}"/>' for name, _ in fields)
    values = " ".join(value for _, value in fields)

    return f"""
    <root
        xmlns:gml="http://www.opengis.net/gml/3.2"
        xmlns:gmlcov="http://www.opengis.net/gmlcov/1.0"
        xmlns:swe="http://www.opengis.net/swe/2.0"
    >
        <gmlcov:rangeType>
            <swe:DataRecord>
                {field_xml}
            </swe:DataRecord>
        </gmlcov:rangeType>
        <gmlcov:positions>
            60.16905 24.833173 1791806400
        </gmlcov:positions>
        <gml:doubleOrNilReasonTupleList>
            {values}
        </gml:doubleOrNilReasonTupleList>
    </root>
    """


@pytest.fixture
def required_fields():
    return [
        ("Temperature", "12.0"),
        ("WindSpeedMS", "4.0"),
        ("HourlyMaximumGust", "7.0"),
        ("WindDirection", "180.0"),
        ("Precipitation1h", "0.0"),
        ("TotalCloudCover", "50.0"),
    ]


@pytest.mark.parametrize("probability", [None, "NaN", "25.0"])
def test_optional_precipitation_probability(required_fields, probability):
    fields = required_fields.copy()

    if probability is not None:
        fields.append(("PoP", probability))

    weather = parse_forecast(
        make_forecast_xml(fields),
        HARMONIE_FIELD_MAP,
    )

    assert len(weather.forecasts) == 1

    forecast = weather.forecasts[0]

    expected = 25.0 if probability == "25.0" else None
    assert forecast.precipitation_probability == expected
    assert forecast.temperature == 12.0
    assert forecast.wind_speed == 4.0
    assert forecast.cloudiness == 50.0


def test_missing_required_field_rejects_response(required_fields):
    fields = [(name, value) for name, value in required_fields if name != "Temperature"]

    with pytest.raises(ValueError, match="Invalid FMI forecast fields"):
        parse_forecast(make_forecast_xml(fields), HARMONIE_FIELD_MAP)


def test_missing_required_measurement_skips_point(required_fields):
    fields = [
        (name, "NaN" if name == "Temperature" else value)
        for name, value in required_fields
    ]

    weather = parse_forecast(make_forecast_xml(fields), HARMONIE_FIELD_MAP)

    assert weather.forecasts == []


@pytest.mark.parametrize(
    ("element_name", "replacement"),
    [
        ("positions", "60 24"),
        ("positions", "60 24 inf"),
        ("positions", "60 24 1791806400.5"),
        ("positions", "60 24 1791806400 60 24 1791810000"),
        ("doubleOrNilReasonTupleList", "12 4"),
        ("doubleOrNilReasonTupleList", "12 4 7 180 0 50 99"),
        ("doubleOrNilReasonTupleList", "12 4 7 180 0 inf"),
        ("doubleOrNilReasonTupleList", "12 4 7 180 0 -inf"),
        ("doubleOrNilReasonTupleList", "12 4 7 180 0 nan"),
    ],
)
def test_rejects_malformed_forecast(
    required_fields,
    element_name,
    replacement,
):
    root = ET.fromstring(make_forecast_xml(required_fields))
    element = root.find(f".//{{*}}{element_name}")
    assert element is not None
    element.text = replacement

    with pytest.raises(ValueError):
        parse_forecast(
            ET.tostring(root, encoding="unicode"),
            HARMONIE_FIELD_MAP,
        )


def test_rejects_duplicate_fields(required_fields):
    fields = required_fields + [("Temperature", "13.0")]

    with pytest.raises(ValueError, match="Invalid FMI forecast fields"):
        parse_forecast(make_forecast_xml(fields), HARMONIE_FIELD_MAP)


def test_rejects_duplicate_timestamps(required_fields):
    root = ET.fromstring(make_forecast_xml(required_fields))
    positions = root.find(".//{*}positions")
    values = root.find(".//{*}doubleOrNilReasonTupleList")
    assert positions is not None
    assert values is not None

    positions.text = "60 24 1791806400 60 24 1791806400"
    row = " ".join(value for _, value in required_fields)
    values.text = f"{row}\n{row}"

    with pytest.raises(ValueError, match="Duplicate"):
        parse_forecast(
            ET.tostring(root, encoding="unicode"),
            HARMONIE_FIELD_MAP,
        )
