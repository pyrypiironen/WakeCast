import pytest

from app.services.fmi_observations import (
    OBSERVATION_FIELD_MAP,
    parse_observations,
)


def make_observation_xml(
    values="12 4 7 180 0 4",
    positions="60 24 1791806400",
    fields=None,
):
    if fields is None:
        fields = list(OBSERVATION_FIELD_MAP)

    field_xml = "".join(f'<swe:field name="{name}"/>' for name in fields)

    return f"""
    <root
        xmlns:gml="http://www.opengis.net/gml/3.2"
        xmlns:gmlcov="http://www.opengis.net/gmlcov/1.0"
        xmlns:swe="http://www.opengis.net/swe/2.0"
    >
        <gmlcov:rangeType>
            <swe:DataRecord>{field_xml}</swe:DataRecord>
        </gmlcov:rangeType>
        <gmlcov:positions>{positions}</gmlcov:positions>
        <gml:doubleOrNilReasonTupleList>
            {values}
        </gml:doubleOrNilReasonTupleList>
    </root>
    """


def test_valid_observation():
    weather = parse_observations(make_observation_xml(), station_id=100971)

    assert weather.observation_station_id == 100971
    assert len(weather.observations) == 1

    observation = weather.observations[0]
    assert observation.temperature == 12.0
    assert observation.wind_speed == 4.0
    assert observation.cloudiness == 50.0
    assert observation.timestamp.tzinfo is not None


def test_preserves_explicit_missing_measurement():
    weather = parse_observations(
        make_observation_xml(values="NaN 4 7 180 0 4"),
        station_id=100971,
    )

    assert len(weather.observations) == 1
    assert weather.observations[0].temperature is None


def test_skips_observation_with_no_measurements():
    weather = parse_observations(
        make_observation_xml(values="NaN NaN NaN NaN NaN NaN"),
        station_id=100971,
    )

    assert weather.observations == []


@pytest.mark.parametrize(
    "changes",
    [
        {"fields": ["unknown"]},
        {"fields": list(OBSERVATION_FIELD_MAP) + ["temperature"]},
        {"values": "12 4"},
        {"values": "12 4 7 180 0 4 99"},
        {"positions": "60 24"},
        {"positions": "60 24 1791806400 60 24 1791810000"},
        {"positions": "60 24 inf"},
        {"positions": "60 24 1791806400.5"},
        {"values": "12 4 7 180 0 inf"},
        {"values": "12 4 7 180 0 -inf"},
        {"values": "12 4 7 180 0 nan"},
    ],
)
def test_rejects_malformed_observations(changes):
    with pytest.raises(ValueError):
        parse_observations(
            make_observation_xml(**changes),
            station_id=100971,
        )


def test_rejects_duplicate_timestamps():
    xml = make_observation_xml(
        values="12 4 7 180 0 4\n13 4 7 180 0 4",
        positions="60 24 1791806400 60 24 1791806400",
    )

    with pytest.raises(ValueError, match="Duplicate"):
        parse_observations(xml, station_id=100971)


def test_sorts_observations_chronologically():
    xml = make_observation_xml(
        values="13 4 7 180 0 4\n12 4 7 180 0 4",
        positions="60 24 1791810000 60 24 1791806400",
    )

    weather = parse_observations(xml, station_id=100971)

    assert [item.temperature for item in weather.observations] == [12.0, 13.0]
