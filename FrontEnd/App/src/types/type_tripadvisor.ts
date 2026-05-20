// Error Type
export type Error = {
    message: string;
    type: string;
    code: number;
}

// 장소 주인 정보
export type OwnerInfo = {
        id: number;
        lang: string;
        text: string;
        title: string;
        author: string;
        published_date: Date;
};

// 고객들의 후기
export type UserReview = {
    username: string;
    user_location: {
        name: string;
        id: string;
    };
    review_count: number;
    reviewer_badge: string;
    avatar: {
        additionalProp: string;
    }
}

// 댓글(리뷰)
export type ReviewData = {
      id: number;
      lang: string;
      location_id: number;
      published_date: Date;
      rating: number; // 이게 아마 평점
      helpful_votes: number;
      rating_image_url: string;
      url: string;
      trip_type: string;
      travel_date: Date;
      text: string;
      title: string;
      owner_response: OwnerInfo;
      is_machine_translated: boolean;
      user: UserReview;
      subratings: {
        additionalProp: {
          name: string;
          localized_name: string;
          rating_image_url: string;
          value: number;
        }
      }
}

// 주소
export type Address = {
    street1: string;
    street2: string;
    city: string;
    state: string;
    country: string
    postalcode: string;
    address_string: string;
}

// 수상 내역(미슐랭과 같은 것들 ㅇㅇ)
export type Award = {
    award_type: string;
    year: number;
    images: {
        tiny: string;
        small: string;
        large: string;
    };
    categories: string[];
    display_name: string;
}

// 영업 시간?
export type Period = {
    open: {
        day: number;
        time: string;
    };

    close: {
        day: number;
        time: string;
    };
}
// ===================================
// LocationReviews: 해당 장소 리뷰들 관련
// ===================================

export type LocationReviews_Response = {
  data: ReviewData[];
  paging: {
    next: string;
    previous: string;
    results: number;
    total_results: number;
    skipped: number;
  };

  error: Error;
}

// ===================================================
// LocationDetails: 해당 장소 상세 정보(위도, 경도, 기타 등등)
// ===================================================

export type LocationDetails_Response = {
  location_id: number;
  name: string;
  description: string;
  web_url: string;
  address_obj: Address;
//   ancestors: [
//     {
//       abbrv: string
//       level: string
//       name: string
//       location_id: 0
//     }
//   ], -> 이건 쓸 일 없을 것 같아서 생략 
  latitude: number;
  longitude: number;
  timezone: string;
  email: string;
  phone: string;
  website: string;
  write_review: string;

  ranking_data: {
    geo_location_id: number;
    ranking_string: string;
    geo_location_name: string;
    ranking_out_of: number;
    ranking: number;
  };

  rating: number;
  rating_image_url: string;
  num_reviews: string;

  review_rating_count: {
    additionalProp: string;
  };

  subratings: {
    additionalProp: {
      name: string;
      localized_name: string;
      rating_image_url: string;
      value: number;
    }
  };

  photo_count: number;
  see_all_photos: string;
  price_level: string;
  hours: {
    periods: Period[];
    weekday_text: string[];
  };

  amenities: string[];
  features: string[];
  cuisine: [ // 이건 당최 뭔지 모르겠음
    {
      name: string;
      localized_name: string;
    }
  ];

  parent_brand: string;
  brand: string;
  category: {
    name: string;
    localized_name: string;
  };

  subcategory: [
    {
      name: string;
      localized_name: string;
    }
  ];

  groups: [
    {
      name: string;
      localized_name: string;
      categories: [
        {
          name: string;
          localized_name: string;
        }
      ]
    }
  ];

  styles: string[];

  neighborhood_info: [ // 아무래도 주변 장소 인듯 
    {
      location_id: string;
      name: string;
    }
  ];

  trip_types: [
    {
      name: string;
      localized_name: string;
      value: string;
    }
  ];

  awards: Award[];
  error: Error;
}