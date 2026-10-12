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


@pytest.mark.parametrize("temperature", [None, "NaN"])
def test_missing_required_temperature_skips_point(
    required_fields,
    temperature,
):
    fields = [(name, value) for name, value in required_fields if name != "Temperature"]

    if temperature is not None:
        fields.insert(0, ("Temperature", temperature))

    weather = parse_forecast(
        make_forecast_xml(fields),
        HARMONIE_FIELD_MAP,
    )

    assert weather.forecasts == []
