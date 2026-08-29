#!/usr/bin/env bash
set -euo pipefail

profile="${ALIBABA_CLOUD_PROFILE:-collabhub-certification}"
region="${ALIBABA_CLOUD_REGION:-cn-hangzhou}"
zone="${ALIBABA_CLOUD_ZONE:-${region}-b}"
secondary_zone="${ALIBABA_CLOUD_SECONDARY_ZONE:-${region}-f}"
ecs_class="${COLLABHUB_ECS_CLASS:-ecs.c7.large}"
rds_class="${COLLABHUB_RDS_CLASS:-pg.x2m.medium.2c}"
redis_class="${COLLABHUB_REDIS_CLASS:-redis.master.small.default}"

ecs_json="$(aliyun ecs DescribePrice --profile "$profile" --region "$region" --RegionId "$region" --ResourceType instance --InstanceType "$ecs_class" --Amount 2 --PriceUnit Hour --SystemDisk.Category cloud_essd --SystemDisk.Size 40 --InternetChargeType PayByTraffic --InternetMaxBandwidthOut 10)"
rds_json="$(aliyun rds DescribePrice --profile "$profile" --region "$region" --RegionId "$region" --ZoneId "$zone" --DBInstanceClass "$rds_class" --DBInstanceStorage 50 --DBInstanceStorageType cloud_essd --Engine PostgreSQL --EngineVersion 16.0 --Quantity 1 --PayType Postpaid --CommodityCode bards)"
redis_json="$(aliyun r-kvstore DescribePrice --profile "$profile" --region "$region" --RegionId "$region" --ZoneId "$zone" --SecondaryZoneId "$secondary_zone" --OrderType BUY --ChargeType PostPaid --InstanceClass "$redis_class" --EngineVersion 7.0 --NodeType MASTER_SLAVE --Quantity 1)"

ecs_hourly="$(jq -er '.PriceInfo.Price.TradePrice' <<<"$ecs_json")"
rds_hourly="$(jq -er '.PriceInfo.TradePrice' <<<"$rds_json")"
redis_hourly="$(jq -er '.Order.TradeAmount' <<<"$redis_json")"
account_warning="$(jq -r '.PriceInfo.PriceWarning.Msg // empty' <<<"$ecs_json")"

# Official ALB list price: Basic instance CNY 0.049/hour plus a minimum 1 LCU
# at CNY 0.049/hour. Public traffic, OSS, and Tablestore remain usage-based.
alb_minimum_hourly=0.098

jq -n \
  --arg profile "$profile" \
  --arg region "$region" \
  --arg ecsClass "$ecs_class" \
  --arg rdsClass "$rds_class" \
  --arg redisClass "$redis_class" \
  --arg accountWarning "$account_warning" \
  --argjson ecsHourly "$ecs_hourly" \
  --argjson rdsHourly "$rds_hourly" \
  --argjson redisHourly "$redis_hourly" \
  --argjson albHourly "$alb_minimum_hourly" \
  '{
    profile: $profile,
    region: $region,
    currency: "CNY",
    assumptions: {
      ecs: ("2 x " + $ecsClass + " with 40 GiB ESSD each"),
      rds: ($rdsClass + " PostgreSQL 16 HA with 50 GB ESSD"),
      redis: ($redisClass + " master-replica"),
      hoursPerMonth: 730
    },
    hourly: {
      ecs: $ecsHourly,
      rds: $rdsHourly,
      redis: $redisHourly,
      albMinimum: $albHourly,
      fixedTotal: ($ecsHourly + $rdsHourly + $redisHourly + $albHourly)
    },
    monthly730Hours: {
      ecs: (($ecsHourly * 73000 | round) / 100),
      rds: (($rdsHourly * 73000 | round) / 100),
      redis: (($redisHourly * 73000 | round) / 100),
      albMinimum: (($albHourly * 73000 | round) / 100),
      fixedTotal: ((($ecsHourly + $rdsHourly + $redisHourly + $albHourly) * 73000 | round) / 100)
    },
    usageBasedNotIncluded: [
      "public outbound traffic",
      "ALB LCU above the first LCU",
      "OSS state and secret object storage/requests",
      "Tablestore state-lock reads, writes, and storage",
      "RDS backup usage beyond the free quota"
    ],
    accountWarning: (if $accountWarning == "" then null else $accountWarning end)
  }'
